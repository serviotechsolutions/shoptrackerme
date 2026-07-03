import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Search, ShoppingCart, X, Plus, Minus, Percent, DollarSign, Tag,
  Trash2, PauseCircle, PlayCircle, CheckCircle,
  Printer, Download, UserPlus, Users, MessageCircle, Mail
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { VoiceSale, VoiceApplyResult, VoiceCompleteData } from "@/components/VoiceSale";
import { useUserRole } from "@/hooks/useUserRole";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { jsPDF } from "jspdf";
import { format } from "date-fns";

interface Product {
  id: string;
  name: string;
  selling_price: number;
  buying_price: number;
  average_cost?: number | null;
  stock: number;
  image_url: string | null;
  barcode: string | null;
  description: string | null;
  category: string;
  low_stock_threshold: number;
}

// Effective unit cost for profit + below-cost checks (prefer weighted average cost).
const costOf = (p: { average_cost?: number | null; buying_price?: number | null }) =>
  Number(p.average_cost ?? 0) > 0 ? Number(p.average_cost) : Number(p.buying_price || 0);

interface CartItem extends Product {
  quantity: number;
}

interface QuickStats {
  salesToday: number;
  transactionsToday: number;
  topItem: string;
}

interface HeldSale {
  id: string;
  cart: CartItem[];
  customerName: string;
  timestamp: Date;
  label: string;
}

interface ShopInfo {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
}

interface CompletedSale {
  invoiceId: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  profit: number;
  paymentMethod: string;
  customerName: string;
  date: Date;
  paymentId: string;
  amountReceived?: number | null;
  change?: number | null;
}

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

const CASHIER_MAX_DISCOUNT_PERCENT = 10;

const POS = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();

  const [products, setProducts] = useState<Product[]>([]);
  const [displayedProducts, setDisplayedProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All Products");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("User");
  const [currentTime, setCurrentTime] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [quickStats, setQuickStats] = useState<QuickStats>({
    salesToday: 0, transactionsToday: 0, topItem: "N/A"
  });
  const [discountType, setDiscountType] = useState<"percentage" | "fixed" | "promo">("percentage");
  const [discountValue, setDiscountValue] = useState<string>("");
  const [promoCode, setPromoCode] = useState<string>("");
  const [validatedPromo, setValidatedPromo] = useState<any>(null);
  const [customerName, setCustomerName] = useState<string>("");
  const [shopInfo, setShopInfo] = useState<ShopInfo | null>(null);
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [heldSalesOpen, setHeldSalesOpen] = useState(false);
  const [tappedProductId, setTappedProductId] = useState<string | null>(null);

  // Customer selection modal state
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("none");
  const [addCustomerMode, setAddCustomerMode] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);

  const categories = [
    "All Products", "Groceries", "Beverages", "Electronics",
    "Cosmetics & Beauty", "Household Items", "Stationery",
    "Snacks", "Hardware Tools", "Others"
  ];

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case "F1": e.preventDefault(); setPaymentMethod("cash"); break;
        case "F2": e.preventDefault(); setPaymentMethod("mobile_money"); break;
        case "F3": e.preventDefault(); setPaymentMethod("card"); break;
        case "F4": e.preventDefault(); setPaymentMethod("other"); break;
        case "Enter":
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); handleCheckout(); }
          break;
        case "Escape": e.preventDefault(); clearCart(); break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cart, paymentMethod, loading, tenantId, user]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) + ", " + now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => { fetchUserData(); fetchProducts(); }, [user]);
  useEffect(() => { if (tenantId) { fetchQuickStats(); fetchShopInfo(); fetchCustomers(); } }, [tenantId]);

  useEffect(() => {
    let filtered = products;
    if (selectedCategory !== "All Products") filtered = filtered.filter(p => p.category === selectedCategory);
    if (searchTerm) filtered = filtered.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.barcode?.includes(searchTerm));
    setDisplayedProducts(filtered);
  }, [searchTerm, products, selectedCategory]);

  const fetchUserData = async () => {
    if (!user) return;
    const { data: profile } = await supabase.from("profiles").select("tenant_id, full_name").eq("id", user.id).single();
    if (profile) { setTenantId(profile.tenant_id); setUserName(profile.full_name || user.email?.split("@")[0] || "User"); }
  };

  const fetchProducts = async () => {
    const { data, error } = await supabase.from("products").select("*").gt("stock", 0).order("name");
    if (error) { toast({ title: "Error", description: "Failed to fetch products", variant: "destructive" }); return; }
    setProducts(data || []);
  };

  const fetchShopInfo = async () => {
    if (!tenantId) return;
    const { data } = await supabase.from("tenants").select("*").eq("id", tenantId).single();
    if (data) setShopInfo(data);
  };

  const fetchCustomers = async () => {
    if (!tenantId) return;
    const { data } = await supabase.from("customers").select("id, name, phone, email").eq("tenant_id", tenantId).order("name");
    if (data) setCustomers(data);
  };

  const fetchQuickStats = async () => {
    if (!tenantId) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const { data: transactions } = await supabase.from("transactions").select("*").eq("tenant_id", tenantId).gte("created_at", today.toISOString());
    if (transactions) {
      const salesToday = transactions.reduce((sum, t) => sum + Number(t.total_amount), 0);
      const itemCounts: Record<string, number> = {};
      transactions.forEach(t => { itemCounts[t.product_name] = (itemCounts[t.product_name] || 0) + t.quantity; });
      const topItem = Object.keys(itemCounts).length > 0 ? Object.entries(itemCounts).sort((a, b) => b[1] - a[1])[0][0] : "N/A";
      setQuickStats({ salesToday, transactionsToday: transactions.length, topItem });
    }
  };

  const handleBarcodeScanned = async (barcode: string) => {
    const product = products.find(p => p.barcode === barcode);
    if (product) { addToCart(product); toast({ title: "Product Found", description: `Added ${product.name} to cart` }); }
    else { toast({ title: "Not Found", description: "No product found with this barcode", variant: "destructive" }); }
  };

  const addToCart = (product: Product) => {
    setTappedProductId(product.id);
    setTimeout(() => setTappedProductId(null), 200);

    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
      if (existingItem.quantity >= product.stock) {
        toast({ title: "Stock Limit", description: "Cannot add more than available stock", variant: "destructive" });
        return;
      }
      setCart(cart.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([...cart, { ...product, selling_price: product.selling_price > 0 ? product.selling_price : costOf(product), quantity: 1 }]);
    }
    setSearchTerm("");
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.id === productId) {
        const newQuantity = item.quantity + delta;
        if (newQuantity <= 0) return null;
        if (newQuantity > item.stock) { toast({ title: "Stock Limit", description: "Cannot exceed available stock", variant: "destructive" }); return item; }
        return { ...item, quantity: newQuantity };
      }
      return item;
    }).filter(Boolean) as CartItem[]);
  };

  const removeFromCart = (productId: string) => setCart(cart.filter(item => item.id !== productId));

  const clearCart = () => {
    if (cart.length === 0) return;
    setCart([]); setDiscountType("percentage"); setDiscountValue(""); setPromoCode(""); setValidatedPromo(null); setCustomerName("");
    toast({ title: "Cart Cleared", description: "All items removed from cart" });
  };

  const updateCartPrice = (productId: string, price: number) => {
    if (price < 0) return;
    setCart(cart.map(item => item.id === productId ? { ...item, selling_price: price } : item));
  };

  // ============ SPEECH-TO-SELL ============
  const handleVoiceApply = async (result: VoiceApplyResult): Promise<string> => {
    const notes: string[] = [];
    const logs: any[] = [];
    const addedDesc: string[] = [];
    let next = [...cart];

    // 1) Add items (with optional spoken price overrides)
    for (const it of result.items) {
      const product = products.find(p => p.id === it.product.id);
      if (!product) continue;
      const existing = next.find(c => c.id === product.id);
      const currentQty = existing?.quantity || 0;
      const addQty = Math.min(it.quantity, Math.max(0, product.stock - currentQty));
      if (addQty <= 0) { notes.push(`${product.name} has no more stock available`); continue; }
      if (addQty < it.quantity) notes.push(`Only ${addQty} ${product.name} available in stock`);

      const defaultPrice = product.selling_price > 0 ? product.selling_price : costOf(product);
      let price = it.unitPrice ?? (existing ? existing.selling_price : defaultPrice);
      if (it.unitPrice != null && !isAdmin && it.unitPrice < costOf(product)) {
        price = costOf(product);
        notes.push(`Price for ${product.name} kept at cost price. Manager approval is needed to sell below cost.`);
      }

      if (existing) {
        next = next.map(c => c.id === product.id ? { ...c, quantity: c.quantity + addQty, selling_price: price } : c);
      } else {
        next = [...next, { ...product, quantity: addQty, selling_price: price }];
      }
      addedDesc.push(`${currentQty + addQty} ${product.name} at ${formatCurrency(price)} each`);
      logs.push({
        action_type: it.unitPrice != null ? "price_override" : "add_items",
        product_id: product.id, product_name: product.name, quantity: addQty,
        original_price: defaultPrice, new_price: price,
      });
    }

    // 2) Permanent / temporary price updates ("Update rice price to 27,000")
    for (const u of result.priceUpdates) {
      if (isAdmin) {
        const { error } = await supabase.from("products").update({ selling_price: u.newPrice }).eq("id", u.product.id);
        if (!error) {
          notes.push(`${u.product.name} price permanently updated to ${formatCurrency(u.newPrice)}`);
          logs.push({ action_type: "price_update", product_id: u.product.id, product_name: u.product.name, original_price: u.product.selling_price, new_price: u.newPrice });
          next = next.map(c => c.id === u.product.id ? { ...c, selling_price: u.newPrice } : c);
        }
      } else {
        const inCart = next.find(c => c.id === u.product.id);
        if (inCart) {
          next = next.map(c => c.id === u.product.id ? { ...c, selling_price: u.newPrice } : c);
          notes.push(`${u.product.name} set to ${formatCurrency(u.newPrice)} for this sale only. Only managers can update prices permanently.`);
          logs.push({ action_type: "price_override", product_id: u.product.id, product_name: u.product.name, original_price: u.product.selling_price, new_price: u.newPrice });
        } else {
          notes.push(`Only managers can permanently update the price of ${u.product.name}.`);
        }
      }
    }

    setCart(next);

    // 3) Discount with role limits
    const subtotalAfter = next.reduce((s, i) => s + i.selling_price * i.quantity, 0);
    let discountAmount = 0;
    if (result.discount) {
      let { kind, value } = result.discount;
      if (!isAdmin) {
        if (kind === "percentage" && value > CASHIER_MAX_DISCOUNT_PERCENT) {
          value = CASHIER_MAX_DISCOUNT_PERCENT;
          notes.push(`Discount limited to ${CASHIER_MAX_DISCOUNT_PERCENT}% for cashiers. Ask a manager for bigger discounts.`);
        }
        if (kind === "fixed") {
          const cap = Math.floor((subtotalAfter * CASHIER_MAX_DISCOUNT_PERCENT) / 100);
          if (value > cap) { value = cap; notes.push(`Discount limited to ${formatCurrency(cap)} for cashiers.`); }
        }
      }
      if (value > 0) {
        setDiscountType(kind); setDiscountValue(String(value)); setValidatedPromo(null); setPromoCode("");
        discountAmount = kind === "percentage" ? (subtotalAfter * value) / 100 : Math.min(value, subtotalAfter);
        logs.push({ action_type: "discount", discount_type: kind, discount_value: value });
      }
    }

    // 4) Audit log every voice action
    if (user && tenantId && logs.length > 0) {
      try {
        await (supabase as any).from("voice_sale_logs").insert(logs.map(l => ({
          ...l, tenant_id: tenantId, user_id: user.id,
          transcript: result.transcript || result.summary,
          details: { summary: result.summary, is_admin: isAdmin },
        })));
      } catch (e) { console.error("Voice audit log failed", e); }
    }

    // 5) Build spoken + toast feedback
    const totalAfter = subtotalAfter - discountAmount;
    let spoken = "";
    if (addedDesc.length) spoken += `Added ${addedDesc.join(", ")}. `;
    if (discountAmount > 0) spoken += `Discount of ${formatCurrency(Math.round(discountAmount))} applied. `;
    if (next.length > 0) spoken += `Cart total is ${formatCurrency(Math.round(totalAfter))}. Please review the cart before completing the sale.`;
    if (notes.length) spoken += ` Note: ${notes.join(". ")}`;

    toast({
      title: "Voice command applied",
      description: spoken || result.summary,
    });
    return spoken || result.summary;
  };

  // ============ SPEAK RECEIPT — full voice checkout ============
  const buildReceiptText = (sale: CompletedSale) => {
    const lines = [
      `${shopInfo?.name || "Shop"} — Receipt ${sale.invoiceId}`,
      format(sale.date, "MMM dd, yyyy HH:mm"),
      sale.customerName ? `Customer: ${sale.customerName}` : "",
      `Served by: ${userName}`,
      "------------------------",
      ...sale.items.map(i => `${i.quantity} x ${i.name} @ ${formatCurrency(i.selling_price)} = ${formatCurrency(i.selling_price * i.quantity)}`),
      "------------------------",
      sale.discount > 0 ? `Discount: -${formatCurrency(sale.discount)}` : "",
      `TOTAL: ${formatCurrency(sale.total)}`,
      sale.amountReceived != null ? `Paid: ${formatCurrency(sale.amountReceived)} (${paymentMethodLabel(sale.paymentMethod)})` : `Payment: ${paymentMethodLabel(sale.paymentMethod)}`,
      sale.change != null && sale.change > 0 ? `Change: ${formatCurrency(sale.change)}` : "",
      "Thank you for your business!",
    ].filter(Boolean);
    return lines.join("\n");
  };

  const handleShareWhatsApp = (sale: CompletedSale, phone?: string | null) => {
    const text = encodeURIComponent(buildReceiptText(sale));
    const target = phone ? phone.replace(/[^0-9]/g, "") : "";
    window.open(`https://wa.me/${target}?text=${text}`, "_blank");
  };

  const handleShareEmail = (sale: CompletedSale, email?: string | null) => {
    const subject = encodeURIComponent(`Receipt ${sale.invoiceId} — ${shopInfo?.name || "Shop"}`);
    const body = encodeURIComponent(buildReceiptText(sale));
    window.location.href = `mailto:${email || ""}?subject=${subject}&body=${body}`;
  };

  const triggerReceiptAction = async (action: string, sale: CompletedSale, custPhone?: string | null, custEmail?: string | null) => {
    try {
      if (action === "download") { const doc = await generateReceiptPDF(sale); doc.save(`receipt-${sale.invoiceId}.pdf`); }
      else if (action === "print") { const doc = await generateReceiptPDF(sale); doc.autoPrint(); window.open(doc.output("bloburl"), "_blank"); }
      else if (action === "whatsapp") handleShareWhatsApp(sale, custPhone);
      else if (action === "email") handleShareEmail(sale, custEmail);
    } catch (e) { console.error("Receipt action failed", e); }
  };

  const handleVoiceCompleteSale = async (data: VoiceCompleteData): Promise<string> => {
    if (!user || !tenantId) return "User session not found. Please sign in again.";
    const notes: string[] = [];
    const logs: any[] = [];

    // Merge voice items into the existing cart
    let saleItems: CartItem[] = [...cart];
    for (const it of data.items) {
      const product = products.find(p => p.id === it.product.id);
      if (!product) continue;
      const existing = saleItems.find(c => c.id === product.id);
      const currentQty = existing?.quantity || 0;
      const addQty = Math.min(it.quantity, Math.max(0, product.stock - currentQty));
      if (addQty <= 0) { notes.push(`${product.name} is out of stock`); continue; }
      if (addQty < it.quantity) notes.push(`Only ${addQty} ${product.name} available`);
      const defaultPrice = product.selling_price > 0 ? product.selling_price : costOf(product);
      let price = it.unitPrice ?? (existing ? existing.selling_price : defaultPrice);
      if (it.unitPrice != null && !isAdmin && it.unitPrice < costOf(product)) {
        price = costOf(product);
        notes.push(`Price for ${product.name} kept at cost price. Manager approval is needed to sell below cost.`);
      }
      if (existing) saleItems = saleItems.map(c => c.id === product.id ? { ...c, quantity: c.quantity + addQty, selling_price: price } : c);
      else saleItems = [...saleItems, { ...product, quantity: addQty, selling_price: price }];
      logs.push({
        action_type: it.unitPrice != null ? "price_override" : "add_items",
        product_id: product.id, product_name: product.name, quantity: addQty,
        original_price: defaultPrice, new_price: price,
      });
    }
    if (saleItems.length === 0) return "There are no items to sell.";

    const subtotal = saleItems.reduce((s, i) => s + i.selling_price * i.quantity, 0);

    // Discount with role limits
    let discountAmount = 0;
    let appliedDiscount: { kind: "percentage" | "fixed"; value: number } | null = null;
    if (data.discount) {
      let { kind, value } = data.discount;
      if (!isAdmin) {
        if (kind === "percentage" && value > CASHIER_MAX_DISCOUNT_PERCENT) {
          value = CASHIER_MAX_DISCOUNT_PERCENT;
          notes.push(`Discount limited to ${CASHIER_MAX_DISCOUNT_PERCENT}% for cashiers.`);
        }
        if (kind === "fixed") {
          const cap = Math.floor((subtotal * CASHIER_MAX_DISCOUNT_PERCENT) / 100);
          if (value > cap) { value = cap; notes.push(`Discount limited to ${formatCurrency(cap)} for cashiers.`); }
        }
      }
      if (value > 0) {
        appliedDiscount = { kind, value };
        discountAmount = kind === "percentage" ? (subtotal * value) / 100 : Math.min(value, subtotal);
        logs.push({ action_type: "discount", discount_type: kind, discount_value: value });
      }
    }

    const total = subtotal - discountAmount;
    const profit = saleItems.reduce((s, i) => s + (i.selling_price - costOf(i)) * i.quantity, 0) - discountAmount;

    // Customer: match existing or create new
    let custId: string | null = null;
    let custName = "";
    let custPhone: string | null = null;
    let custEmail: string | null = null;
    if (data.customer) {
      if (data.customer.id) {
        const found = customers.find(c => c.id === data.customer!.id);
        custId = data.customer.id;
        custName = found?.name || data.customer.name;
        custPhone = found?.phone || null;
        custEmail = found?.email || null;
      } else if (data.customer.name) {
        try {
          const { data: created } = await supabase.from("customers")
            .insert({ tenant_id: tenantId, name: data.customer.name })
            .select().single();
          if (created) {
            custId = created.id; custName = created.name;
            setCustomers(prev => [...prev, created]);
            notes.push(`New customer ${created.name} created.`);
          } else custName = data.customer.name;
        } catch { custName = data.customer.name; }
      }
    }

    const payMethod = data.payment?.method || "cash";
    const amountReceived = data.payment?.amount ?? null;
    const change = amountReceived != null ? Math.max(0, amountReceived - total) : null;
    if (amountReceived != null && amountReceived < total) {
      notes.push(`Amount received ${formatCurrency(amountReceived)} is less than the total. Balance: ${formatCurrency(total - amountReceived)}.`);
    }

    setLoading(true);
    try {
      for (const item of saleItems) {
        const itemSubtotal = item.selling_price * item.quantity;
        const ratio = subtotal > 0 ? itemSubtotal / subtotal : 0;
        const itemDiscount = discountAmount * ratio;
        const { error: txErr } = await supabase.from("transactions").insert({
          tenant_id: tenantId, product_id: item.id, product_name: item.name,
          quantity: item.quantity, unit_price: item.selling_price,
          total_amount: itemSubtotal - itemDiscount,
          profit: (item.selling_price - costOf(item)) * item.quantity - itemDiscount,
          average_cost_at_sale: costOf(item),
          payment_method: payMethod, created_by: user.id,
          discount_type: appliedDiscount?.kind || null,
          discount_value: appliedDiscount?.value || 0,
          discount_amount: itemDiscount,
        } as any);
        if (txErr) throw txErr;
        const { error: stockErr } = await supabase.from("products").update({ stock: item.stock - item.quantity }).eq("id", item.id);
        if (stockErr) throw stockErr;
      }

      const { data: paymentData, error: paymentError } = await supabase.from("payments").insert({
        tenant_id: tenantId, amount: total, payment_method: payMethod,
        payment_status: "completed",
        customer_id: custId, customer_name: custName || null,
        payment_date: new Date().toISOString(),
        notes: `Speak Receipt sale — ${saleItems.length} item(s)` +
          (amountReceived != null ? ` | Paid: ${formatCurrency(amountReceived)} | Change: ${formatCurrency(change || 0)}` : ""),
      }).select().single();
      if (paymentError) throw paymentError;

      await supabase.from("payment_items").insert(saleItems.map(item => ({
        payment_id: paymentData.id, product_id: item.id, product_name: item.name,
        quantity: item.quantity, price: item.selling_price, total_price: item.selling_price * item.quantity,
      })));

      // Audit log — full voice transaction including payment details
      try {
        await (supabase as any).from("voice_sale_logs").insert(
          [...logs, { action_type: "complete_sale" }].map(l => ({
            ...l, tenant_id: tenantId, user_id: user.id,
            transcript: data.transcript || data.summary,
            details: {
              summary: data.summary, is_admin: isAdmin, customer: custName || null,
              payment_method: payMethod, amount_received: amountReceived, change,
              total, subtotal, discount: appliedDiscount,
            },
          }))
        );
      } catch (e) { console.error("Voice audit log failed", e); }

      const now = new Date();
      const invoiceId = `INV-${format(now, "yyyyMMddHHmmss")}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const sale: CompletedSale = {
        invoiceId, items: [...saleItems], subtotal, discount: discountAmount, total, profit,
        paymentMethod: payMethod, customerName: custName, date: now, paymentId: paymentData.id,
        amountReceived, change,
      };
      setCompletedSale(sale);
      setReceiptDialogOpen(true);

      setCart([]); setPaymentMethod("cash"); setDiscountType("percentage"); setDiscountValue("");
      setPromoCode(""); setValidatedPromo(null); setCustomerName("");
      fetchProducts(); fetchQuickStats();

      if (data.receiptAction) {
        const action = data.receiptAction;
        setTimeout(() => { triggerReceiptAction(action, sale, custPhone, custEmail); }, 800);
      }

      let spoken = `Sale completed. Total ${formatCurrency(Math.round(total))}.`;
      if (amountReceived != null) {
        spoken += ` Customer paid ${formatCurrency(amountReceived)} by ${paymentMethodLabel(payMethod)}.`;
        if ((change || 0) > 0) spoken += ` Change is ${formatCurrency(Math.round(change || 0))}.`;
      }
      if (custName) spoken += ` Recorded for ${custName}.`;
      spoken += " Receipt is ready.";
      if (notes.length) spoken += ` Note: ${notes.join(". ")}`;
      toast({ title: "Sale Completed by Voice", description: spoken });
      return spoken;
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to complete sale", variant: "destructive" });
      return `Sale failed. ${error.message || ""}`;
    } finally {
      setLoading(false);
    }
  };


  const calculateSubtotal = () => cart.reduce((sum, item) => sum + item.selling_price * item.quantity, 0);

  const calculateDiscount = () => {
    const subtotal = calculateSubtotal();
    if (discountType === "promo" && validatedPromo) {
      if (validatedPromo.discount_type === "percentage") return (subtotal * validatedPromo.discount_value) / 100;
      return Math.min(validatedPromo.discount_value, subtotal);
    } else if (discountType === "percentage" && discountValue) {
      const percent = parseFloat(discountValue);
      if (!isNaN(percent) && percent > 0 && percent <= 100) return (subtotal * percent) / 100;
    } else if (discountType === "fixed" && discountValue) {
      const amount = parseFloat(discountValue);
      if (!isNaN(amount) && amount > 0) return Math.min(amount, subtotal);
    }
    return 0;
  };

  const calculateTotal = () => calculateSubtotal() - calculateDiscount();
  const calculateProfit = () => cart.reduce((sum, item) => sum + (item.selling_price - costOf(item)) * item.quantity, 0) - calculateDiscount();

  const validatePromoCode = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) { toast({ title: "Error", description: "Please enter a promo code", variant: "destructive" }); return; }
    const now = new Date();
    console.log("[Promo] Validating", code, "at", now.toISOString());

    // 1) PRIORITY: Check Smart Promotions / Flash Sales first (time-sensitive)
    const { data: promoList } = await supabase.from("promotions").select("*").ilike("promo_code", code);
    const promo = promoList?.find(p => p.promo_code?.trim().toUpperCase() === code);
    if (promo) {
      const start = promo.start_time ? new Date(promo.start_time) : null;
      const end = promo.end_time ? new Date(promo.end_time) : null;
      const inWindow = (!start || start <= now) && (!end || end >= now);
      console.log("[Promo] Found in smart_promotions", { code, now: now.toISOString(), start: start?.toISOString(), end: end?.toISOString(), inWindow });
      if (inWindow) {
        if (promo.max_redemptions && promo.current_redemptions >= promo.max_redemptions) {
          toast({ title: "Limit Reached", description: "Redemption limit reached", variant: "destructive" }); return;
        }
        // Auto-activate if within window (ignore is_active/status)
        if (promo.status !== "active") {
          await supabase.from("promotions").update({ status: "active" } as any).eq("id", promo.id);
        }
        const adapted = {
          id: promo.id,
          code: promo.promo_code,
          discount_type: promo.discount_type,
          discount_value: Number(promo.discount_value),
          times_used: promo.current_redemptions || 0,
          _source: "promotions",
        };
        setValidatedPromo(adapted as any); setDiscountType("promo");
        toast({ title: "Flash Sale Applied", description: `Applied ${promo.discount_type === "percentage" ? promo.discount_value + "%" : formatCurrency(Number(promo.discount_value))} discount` });
        return;
      }
      // Found but outside window — fall through to check promo_codes too
      console.log("[Promo] Smart promotion outside time window, checking promo_codes...");
    }

    // 2) Check promo_codes table (case-insensitive)
    const { data: pcList } = await supabase.from("promo_codes").select("*").ilike("code", code);
    const pc = pcList?.find(p => p.code.trim().toUpperCase() === code);
    if (pc) {
      console.log("[Promo] Found in promo_codes", pc);
      if (pc.is_active === false) { toast({ title: "Invalid Code", description: "Promo code is inactive", variant: "destructive" }); return; }
      if (pc.valid_from && new Date(pc.valid_from) > now) { toast({ title: "Not Yet Active", description: "Promo code not yet valid", variant: "destructive" }); return; }
      if (pc.valid_until && new Date(pc.valid_until) < now) { toast({ title: "Expired", description: "This promo code has expired", variant: "destructive" }); return; }
      if (pc.usage_limit && pc.times_used >= pc.usage_limit) { toast({ title: "Limit Reached", description: "Usage limit reached", variant: "destructive" }); return; }
      setValidatedPromo({ ...pc, _source: "promo_codes" } as any); setDiscountType("promo");
      toast({ title: "Success", description: `Applied ${pc.discount_type === "percentage" ? pc.discount_value + "%" : formatCurrency(pc.discount_value)} discount` });
      return;
    }

    // If smart promo existed but was out of window, report that specifically
    if (promo) {
      const end = promo.end_time ? new Date(promo.end_time) : null;
      toast({ title: end && end < now ? "Expired" : "Not Yet Active", description: end && end < now ? "This flash sale has ended" : "This flash sale hasn't started yet", variant: "destructive" });
      return;
    }

    console.log("[Promo] Not found in either table");
    toast({ title: "Invalid Code", description: "Promo code not found or inactive", variant: "destructive" });
  };

  const holdSale = () => {
    if (cart.length === 0) { toast({ title: "Empty Cart", description: "Nothing to hold", variant: "destructive" }); return; }
    const held: HeldSale = { id: crypto.randomUUID(), cart: [...cart], customerName, timestamp: new Date(), label: customerName || `Sale #${heldSales.length + 1}` };
    setHeldSales([...heldSales, held]); setCart([]); setCustomerName(""); setDiscountType("percentage"); setDiscountValue(""); setPromoCode(""); setValidatedPromo(null);
    toast({ title: "Sale Held", description: `"${held.label}" parked.` });
  };

  const resumeSale = (heldSale: HeldSale) => {
    if (cart.length > 0) holdSale();
    setCart(heldSale.cart); setCustomerName(heldSale.customerName);
    setHeldSales(heldSales.filter(s => s.id !== heldSale.id)); setHeldSalesOpen(false);
    toast({ title: "Sale Resumed", description: `Resumed "${heldSale.label}"` });
  };

  const deleteHeldSale = (id: string) => setHeldSales(heldSales.filter(s => s.id !== id));

  const generateReceiptPDF = async (sale: CompletedSale) => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [80, 200] });
    const pw = 80; let y = 10;
    if (shopInfo?.logo_url) {
      try {
        const res = await fetch(shopInfo.logo_url); const blob = await res.blob();
        const b64 = await new Promise<string>(r => { const fr = new FileReader(); fr.onloadend = () => r(fr.result as string); fr.readAsDataURL(blob); });
        doc.addImage(b64, "PNG", (pw - 20) / 2, y, 20, 20); y += 24;
      } catch { /* skip */ }
    }
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text(shopInfo?.name || "Shop", pw / 2, y, { align: "center" }); y += 6;
    if (shopInfo?.address) { doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.text(shopInfo.address, pw / 2, y, { align: "center" }); y += 4; }
    if (shopInfo?.phone) { doc.setFontSize(8); doc.text(`Tel: ${shopInfo.phone}`, pw / 2, y, { align: "center" }); y += 4; }
    y += 2; doc.line(5, y, pw - 5, y); y += 6;
    doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.text("RECEIPT", pw / 2, y, { align: "center" }); y += 6;
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text(`Invoice: ${sale.invoiceId}`, 5, y); y += 4;
    doc.text(`Date: ${format(sale.date, "MMM dd, yyyy HH:mm")}`, 5, y); y += 4;
    doc.text(`Payment: ${paymentMethodLabel(sale.paymentMethod)}`, 5, y); y += 4;
    if (sale.customerName) { doc.text(`Customer: ${sale.customerName}`, 5, y); y += 4; }
    y += 2; doc.line(5, y, pw - 5, y); y += 4;
    doc.setFont("helvetica", "bold");
    doc.text("Item", 5, y); doc.text("Qty", 40, y); doc.text("Price", 50, y); doc.text("Total", 65, y); y += 4;
    doc.line(5, y, pw - 5, y); y += 4;
    doc.setFont("helvetica", "normal");
    sale.items.forEach(item => {
      const name = item.name.length > 15 ? item.name.substring(0, 15) + "..." : item.name;
      doc.text(name, 5, y); doc.text(String(item.quantity), 42, y);
      doc.text(String(Math.round(item.selling_price)), 50, y);
      doc.text(String(Math.round(item.selling_price * item.quantity)), 65, y); y += 4;
    });
    y += 2; doc.line(5, y, pw - 5, y); y += 4;
    if (sale.discount > 0) {
      doc.text("Subtotal:", 5, y); doc.text(formatCurrency(sale.subtotal), pw - 5, y, { align: "right" }); y += 4;
      doc.text("Discount:", 5, y); doc.text(`-${formatCurrency(sale.discount)}`, pw - 5, y, { align: "right" }); y += 4;
    }
    doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text("TOTAL:", 5, y); doc.text(formatCurrency(sale.total), pw - 5, y, { align: "right" }); y += 5;
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    if (sale.amountReceived != null) {
      doc.text("Paid:", 5, y); doc.text(formatCurrency(sale.amountReceived), pw - 5, y, { align: "right" }); y += 4;
      doc.text("Change:", 5, y); doc.text(formatCurrency(sale.change || 0), pw - 5, y, { align: "right" }); y += 4;
    }
    y += 2;
    doc.text(`Served by: ${userName}`, 5, y); y += 5;
    doc.text("Thank you for your business!", pw / 2, y, { align: "center" }); y += 4;
    doc.text("Please come again", pw / 2, y, { align: "center" });
    return doc;
  };

  const handleDownloadReceipt = async () => { if (!completedSale) return; const doc = await generateReceiptPDF(completedSale); doc.save(`receipt-${completedSale.invoiceId}.pdf`); };
  const handlePrintReceipt = async () => { if (!completedSale) return; const doc = await generateReceiptPDF(completedSale); doc.autoPrint(); window.open(doc.output("bloburl"), "_blank"); };

  const handleCheckout = async () => {
    if (cart.length === 0) { toast({ title: "Empty Cart", description: "Please add items to cart before checkout", variant: "destructive" }); return; }
    if (!user || !tenantId) { toast({ title: "Error", description: "User session not found", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const discountAmount = calculateDiscount();
      const subtotal = calculateSubtotal();
      const total = calculateTotal();
      const profit = calculateProfit();

      if (discountType === "promo" && validatedPromo) {
        const src = (validatedPromo as any)._source;
        if (src === "promotions") {
          await supabase.from("promotions").update({ current_redemptions: (validatedPromo.times_used || 0) + 1 } as any).eq("id", validatedPromo.id);
        } else {
          await supabase.from("promo_codes").update({ times_used: (validatedPromo.times_used || 0) + 1 }).eq("id", validatedPromo.id);
        }
      }

      for (const item of cart) {
        const itemSubtotal = item.selling_price * item.quantity;
        const itemDiscountRatio = subtotal > 0 ? itemSubtotal / subtotal : 0;
        const itemDiscount = discountAmount * itemDiscountRatio;
        const totalAmount = itemSubtotal - itemDiscount;
        const itemProfit = (item.selling_price - costOf(item)) * item.quantity - itemDiscount;

        const { error: transactionError } = await supabase.from("transactions").insert({
          tenant_id: tenantId, product_id: item.id, product_name: item.name,
          quantity: item.quantity, unit_price: item.selling_price,
          total_amount: totalAmount, profit: itemProfit, payment_method: paymentMethod,
          created_by: user.id,
          average_cost_at_sale: costOf(item),
          discount_type: discountAmount > 0 ? discountType : null,
          discount_value: discountAmount > 0 ? (discountType === "promo" ? validatedPromo?.discount_value : parseFloat(discountValue)) : 0,
          promo_code: discountType === "promo" ? promoCode.toUpperCase() : null,
          discount_amount: itemDiscount
        } as any);
        if (transactionError) throw transactionError;

        const { error: stockError } = await supabase.from("products").update({ stock: item.stock - item.quantity }).eq("id", item.id);
        if (stockError) throw stockError;
      }

      // AUTO-CREATE PAYMENT RECORD with "pending_customer" status
      const { data: paymentData, error: paymentError } = await supabase.from("payments").insert({
        tenant_id: tenantId,
        amount: total,
        payment_method: paymentMethod,
        payment_status: customerName ? "completed" : "pending_customer",
        customer_name: customerName || null,
        payment_date: new Date().toISOString(),
        notes: `POS Sale - ${cart.length} item(s)`,
      }).select().single();

      if (paymentError) throw paymentError;

      // Create payment items
      const paymentItems = cart.map(item => ({
        payment_id: paymentData.id,
        product_id: item.id,
        product_name: item.name,
        quantity: item.quantity,
        price: item.selling_price,
        total_price: item.selling_price * item.quantity,
      }));
      await supabase.from("payment_items").insert(paymentItems);

      // Build completed sale for receipt
      const now = new Date();
      const invoiceId = `INV-${format(now, "yyyyMMddHHmmss")}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const sale: CompletedSale = { invoiceId, items: [...cart], subtotal, discount: discountAmount, total, profit, paymentMethod, customerName, date: now, paymentId: paymentData.id };
      setCompletedSale(sale);

      // If no customer was set, show customer selection modal; otherwise show receipt
      if (!customerName) {
        setCustomerModalOpen(true);
      } else {
        setReceiptDialogOpen(true);
      }

      setCart([]); setPaymentMethod("cash"); setDiscountType("percentage"); setDiscountValue("");
      setPromoCode(""); setValidatedPromo(null); setCustomerName("");
      fetchProducts(); fetchQuickStats();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to complete sale", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Assign customer to the completed payment
  const handleAssignCustomer = async (customerId: string | null, custName: string | null) => {
    if (!completedSale) return;
    setSavingCustomer(true);
    try {
      const { error } = await supabase.from("payments").update({
        customer_id: customerId,
        customer_name: custName,
        payment_status: "completed",
      }).eq("id", completedSale.paymentId);

      if (error) throw error;

      setCompletedSale({ ...completedSale, customerName: custName || "" });
      toast({ title: "Customer Added", description: custName ? `Assigned to ${custName}` : "Payment completed" });
      setCustomerModalOpen(false);
      setReceiptDialogOpen(true);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleCreateAndAssignCustomer = async () => {
    if (!newCustomerName.trim() || !tenantId) return;
    setSavingCustomer(true);
    try {
      const { data, error } = await supabase.from("customers").insert({
        tenant_id: tenantId,
        name: newCustomerName.trim(),
        phone: newCustomerPhone || null,
        email: newCustomerEmail || null,
      }).select().single();

      if (error) throw error;

      // Add to local list
      setCustomers(prev => [...prev, data]);
      await handleAssignCustomer(data.id, data.name);
      setAddCustomerMode(false);
      setNewCustomerName(""); setNewCustomerPhone(""); setNewCustomerEmail("");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setSavingCustomer(false);
    }
  };

  const handleSkipCustomer = async () => {
    if (!completedSale) return;
    // Mark as completed even without customer
    setSavingCustomer(true);
    try {
      await supabase.from("payments").update({ payment_status: "completed" }).eq("id", completedSale.paymentId);
      setCustomerModalOpen(false);
      setReceiptDialogOpen(true);
    } catch {
      // still show receipt
      setCustomerModalOpen(false);
      setReceiptDialogOpen(true);
    } finally {
      setSavingCustomer(false);
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.phone && c.phone.includes(customerSearch)) ||
    (c.email && c.email.toLowerCase().includes(customerSearch.toLowerCase()))
  );

  const formatCurrency = (amount: number) => `UGX ${amount.toLocaleString()}`;
  const paymentMethodLabel = (method: string) => ({ cash: "Cash", mobile_money: "Mobile Money", card: "Card", other: "Other" }[method] || method);

  const handleLogout = async () => { await supabase.auth.signOut(); navigate("/auth"); };

  return (
    <DashboardLayout>
    <div className="-m-4 md:-m-6">
      {/* POS Sub-header */}
      <header className="bg-primary text-primary-foreground shadow-lg">
        <div className="container mx-auto px-2 sm:px-4 py-3 sm:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ShoppingCart className="h-5 w-5 sm:h-6 sm:w-6 shrink-0" />
            <h1 className="text-base sm:text-xl font-bold truncate">Shop POS</h1>
          </div>
          <div className="hidden md:block text-center">
            <p className="text-sm font-medium whitespace-nowrap">{currentTime}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {heldSales.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => setHeldSalesOpen(true)} className="relative gap-1">
                <PauseCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Held</span>
                <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-[10px] bg-destructive text-destructive-foreground">{heldSales.length}</Badge>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Left Section - Products */}
          <div className="lg:col-span-2 space-y-4">
            {/* Search */}
            <div className="bg-card rounded-lg shadow-sm p-3 sm:p-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input placeholder="Search products..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 h-12 text-base" />
                </div>
                <BarcodeScanner onScan={handleBarcodeScanned} />
                <VoiceSale products={products} customers={customers} onApply={handleVoiceApply} onCompleteSale={handleVoiceCompleteSale} />
              </div>
            </div>

            {/* Categories */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
              {categories.map((category) => (
                <Button key={category} variant={selectedCategory === category ? "default" : "outline"} onClick={() => setSelectedCategory(category)} className="whitespace-nowrap text-xs sm:text-sm shrink-0" size="sm">
                  {category}
                </Button>
              ))}
            </div>

            {/* Product Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
              {displayedProducts.map((product) => {
                const inCart = cart.find(i => i.id === product.id);
                const isTapped = tappedProductId === product.id;
                return (
                  <div
                    key={product.id}
                    className={`bg-card rounded-xl shadow-sm overflow-hidden border-2 transition-all duration-150 relative
                      ${inCart ? "border-primary ring-1 ring-primary/30" : "border-transparent"}
                      ${isTapped ? "scale-95 bg-primary/5" : ""}
                      active:scale-95 active:bg-primary/5
                    `}
                  >
                    <div className="aspect-square bg-muted flex items-center justify-center relative">
                      <img
                        src={product.image_url || "/placeholder.svg"}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/placeholder.svg"; }}
                      />
                      {product.stock <= product.low_stock_threshold && (
                        <Badge variant="destructive" className="absolute top-1.5 right-1.5 text-[10px] px-1.5 py-0.5">
                          {product.stock} left
                        </Badge>
                      )}
                      {inCart && (
                        <Badge className="absolute top-1.5 left-1.5 bg-primary text-primary-foreground text-xs px-2 py-0.5">
                          {inCart.quantity}×
                        </Badge>
                      )}
                    </div>

                    <div className="p-2.5 sm:p-3">
                      <h3 className="font-semibold text-xs sm:text-sm line-clamp-2 leading-tight mb-1">{product.name}</h3>
                      <p className="text-sm sm:text-base font-bold text-primary">
                        {product.selling_price > 0 ? formatCurrency(product.selling_price) : (
                          <span className="text-xs text-muted-foreground font-normal">Cost: {formatCurrency(product.buying_price)}</span>
                        )}
                      </p>
                      <p className="text-[10px] text-muted-foreground mb-2">{product.stock} in stock</p>

                      <Button
                        onClick={(e) => { e.stopPropagation(); addToCart(product); }}
                        size="sm"
                        className="w-full h-10 sm:h-9 text-sm font-semibold gap-1.5 rounded-lg"
                      >
                        <Plus className="h-4 w-4" />
                        Add
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {displayedProducts.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No products found</p>
              </div>
            )}
          </div>

          {/* Right Section - Cart & Stats */}
          <div className="lg:sticky lg:top-20 space-y-4 self-start">
            {/* Quick Stats */}
            <div className="bg-card rounded-lg shadow-sm p-4">
              <h2 className="text-sm font-bold mb-2">Today's Stats</h2>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center min-w-0">
                  <p className="text-sm font-bold text-primary truncate">{formatCurrency(quickStats.salesToday)}</p>
                  <p className="text-[10px] text-muted-foreground">Revenue</p>
                </div>
                <div className="text-center min-w-0">
                  <p className="text-sm font-bold">{quickStats.transactionsToday}</p>
                  <p className="text-[10px] text-muted-foreground">Sales</p>
                </div>
                <div className="text-center min-w-0">
                  <p className="text-xs font-bold truncate">{quickStats.topItem}</p>
                  <p className="text-[10px] text-muted-foreground">Top Item</p>
                </div>
              </div>
            </div>

            {/* Cart */}
            <div className="bg-card rounded-lg shadow-sm p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold">Cart</h2>
                  {cartItemCount > 0 && <Badge variant="secondary" className="text-xs">{cartItemCount} item{cartItemCount !== 1 ? "s" : ""}</Badge>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={holdSale} disabled={cart.length === 0} title="Hold/Park Sale"><PauseCircle className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={clearCart} disabled={cart.length === 0} title="Clear Cart (Esc)" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>

              <div className="overflow-y-auto space-y-3 mb-3 max-h-48 lg:max-h-40">
                {cart.length === 0 ? (
                  <div className="text-center text-muted-foreground py-6">
                    <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Cart is empty</p>
                    <p className="text-xs mt-1">Tap a product to add it</p>
                  </div>
                ) : (
                  cart.map((item) => (
                    <div key={item.id} className="flex items-start gap-2 pb-2 border-b last:border-b-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-medium text-sm truncate">{item.name}</span>
                          <Button size="sm" variant="ghost" onClick={() => removeFromCart(item.id)} className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></Button>
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => updateQuantity(item.id, -1)}><Minus className="h-3 w-3" /></Button>
                            <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                            <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => updateQuantity(item.id, 1)}><Plus className="h-3 w-3" /></Button>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">@</span>
                            <Input type="number" value={item.selling_price} onChange={(e) => updateCartPrice(item.id, parseFloat(e.target.value) || 0)} className={`w-24 h-7 text-sm ${item.selling_price < costOf(item) ? "border-destructive text-destructive" : ""}`} min="0" step="1" />
                          </div>
                          <span className="ml-auto font-semibold text-sm">{formatCurrency(item.selling_price * item.quantity)}</span>
                        </div>
                        {item.selling_price < costOf(item) && <p className="text-xs text-destructive mt-0.5">Below cost ({formatCurrency(costOf(item))})</p>}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Summary */}
              <div className="border-t pt-2 space-y-1">
                <div className="flex justify-between text-sm"><span>Subtotal</span><span className="font-semibold">{formatCurrency(calculateSubtotal())}</span></div>
                {calculateDiscount() > 0 && (
                  <div className="flex justify-between text-sm text-green-600 dark:text-green-400"><span>Discount</span><span className="font-semibold">-{formatCurrency(calculateDiscount())}</span></div>
                )}
                <div className="flex justify-between text-base font-bold border-t pt-1"><span>Total</span><span className="text-primary">{formatCurrency(calculateTotal())}</span></div>
              </div>

              {/* Discount */}
              <div className="mt-2 space-y-2">
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant={discountType === "percentage" ? "default" : "outline"} onClick={() => { setDiscountType("percentage"); setValidatedPromo(null); }} className="flex-1 text-xs h-8"><Percent className="h-3 w-3 mr-1" /> %</Button>
                  <Button type="button" size="sm" variant={discountType === "fixed" ? "default" : "outline"} onClick={() => { setDiscountType("fixed"); setValidatedPromo(null); }} className="flex-1 text-xs h-8"><DollarSign className="h-3 w-3 mr-1" /> UGX</Button>
                  <Button type="button" size="sm" variant={discountType === "promo" ? "default" : "outline"} onClick={() => setDiscountType("promo")} className="flex-1 text-xs h-8"><Tag className="h-3 w-3 mr-1" /> Code</Button>
                </div>
                {discountType === "promo" ? (
                  <div className="flex gap-2">
                    <Input placeholder="Promo code" value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} disabled={!!validatedPromo} className="h-8 text-sm" />
                    <Button type="button" size="sm" className="h-8" onClick={validatedPromo ? () => { setValidatedPromo(null); setPromoCode(""); } : validatePromoCode} variant={validatedPromo ? "destructive" : "default"}>{validatedPromo ? "Clear" : "Apply"}</Button>
                  </div>
                ) : (
                  <Input type="number" placeholder={discountType === "percentage" ? "Enter %" : "Enter amount"} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} min="0" max={discountType === "percentage" ? "100" : undefined} className="h-8 text-sm" />
                )}
                <Input placeholder="Customer Name (Optional)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="h-8 text-sm" />
              </div>

              {/* Payment Buttons */}
              <div className="mt-2 grid grid-cols-4 gap-1">
                {[{ key: "cash", label: "Cash" }, { key: "mobile_money", label: "MoMo" }, { key: "card", label: "Card" }, { key: "other", label: "Other" }].map(pm => (
                  <Button key={pm.key} variant={paymentMethod === pm.key ? "default" : "outline"} onClick={() => setPaymentMethod(pm.key)} className="w-full h-8 text-xs px-1" size="sm">{pm.label}</Button>
                ))}
              </div>

              <Button onClick={handleCheckout} disabled={loading || cart.length === 0} className="w-full mt-3 text-sm" size="lg">
                {loading ? "Processing..." : `Checkout • ${formatCurrency(calculateTotal())}`}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Selection Modal — shown after sale if no customer was provided */}
      <Dialog open={customerModalOpen} onOpenChange={(open) => {
        if (!open) handleSkipCustomer();
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Complete Payment Details
            </DialogTitle>
            <DialogDescription>
              Sale completed! Optionally assign a customer to this payment.
            </DialogDescription>
          </DialogHeader>

          {!addCustomerMode ? (
            <div className="space-y-4">
              {/* Search customers */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search customers by name, phone..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Customer list */}
              <div className="max-h-60 overflow-y-auto space-y-1 border rounded-lg p-2">
                {filteredCustomers.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-4">No customers found</p>
                ) : (
                  filteredCustomers.map(customer => (
                    <button
                      key={customer.id}
                      onClick={() => handleAssignCustomer(customer.id, customer.name)}
                      disabled={savingCustomer}
                      className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors text-left"
                    >
                      <div>
                        <p className="font-medium text-sm">{customer.name}</p>
                        {customer.phone && <p className="text-xs text-muted-foreground">{customer.phone}</p>}
                      </div>
                      <CheckCircle className="h-4 w-4 text-muted-foreground/30" />
                    </button>
                  ))
                )}
              </div>

              {/* Add new customer button */}
              <Button variant="outline" className="w-full gap-2" onClick={() => setAddCustomerMode(true)}>
                <UserPlus className="h-4 w-4" /> Add New Customer
              </Button>

              {/* Skip button */}
              <Button variant="ghost" className="w-full text-muted-foreground" onClick={handleSkipCustomer} disabled={savingCustomer}>
                Skip — Continue as Walk-in
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Customer Name *</Label>
                <Input value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} placeholder="John Doe" />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={newCustomerPhone} onChange={e => setNewCustomerPhone(e.target.value)} placeholder="+256..." />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={newCustomerEmail} onChange={e => setNewCustomerEmail(e.target.value)} placeholder="john@example.com" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setAddCustomerMode(false)}>Back</Button>
                <Button className="flex-1" onClick={handleCreateAndAssignCustomer} disabled={!newCustomerName.trim() || savingCustomer}>
                  {savingCustomer ? "Saving..." : "Save & Assign"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Receipt Dialog */}
      <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle className="h-6 w-6" /> Sale Completed!
            </DialogTitle>
            <DialogDescription>{completedSale?.invoiceId}</DialogDescription>
          </DialogHeader>
          {completedSale && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm"><span>Items</span><span className="font-medium">{completedSale.items.reduce((s, i) => s + i.quantity, 0)}</span></div>
                {completedSale.discount > 0 && <div className="flex justify-between text-sm text-green-600 dark:text-green-400"><span>Discount</span><span>-{formatCurrency(completedSale.discount)}</span></div>}
                <div className="flex justify-between text-lg font-bold border-t pt-2"><span>Total Paid</span><span className="text-primary">{formatCurrency(completedSale.total)}</span></div>
                {completedSale.amountReceived != null && (
                  <>
                    <div className="flex justify-between text-sm"><span>Amount Received</span><span className="font-medium">{formatCurrency(completedSale.amountReceived)}</span></div>
                    <div className="flex justify-between text-sm font-semibold text-green-600 dark:text-green-400"><span>Change</span><span>{formatCurrency(completedSale.change || 0)}</span></div>
                  </>
                )}
                <div className="flex justify-between text-sm"><span>Payment</span><Badge variant="secondary">{paymentMethodLabel(completedSale.paymentMethod)}</Badge></div>
                {completedSale.customerName && <div className="flex justify-between text-sm"><span>Customer</span><span className="font-medium">{completedSale.customerName}</span></div>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={handleDownloadReceipt} className="gap-2"><Download className="h-4 w-4" /> Download</Button>
                <Button variant="outline" onClick={handlePrintReceipt} className="gap-2"><Printer className="h-4 w-4" /> Print</Button>
                <Button variant="outline" onClick={() => completedSale && handleShareWhatsApp(completedSale, customers.find(c => c.name === completedSale.customerName)?.phone)} className="gap-2"><MessageCircle className="h-4 w-4" /> WhatsApp</Button>
                <Button variant="outline" onClick={() => completedSale && handleShareEmail(completedSale, customers.find(c => c.name === completedSale.customerName)?.email)} className="gap-2"><Mail className="h-4 w-4" /> Email</Button>
              </div>
              <Button className="w-full" onClick={() => setReceiptDialogOpen(false)}>New Sale</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Held Sales Dialog */}
      <Dialog open={heldSalesOpen} onOpenChange={setHeldSalesOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><PauseCircle className="h-5 w-5" /> Held Sales ({heldSales.length})</DialogTitle>
            <DialogDescription>Resume a parked sale</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {heldSales.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No held sales</p>
            ) : (
              heldSales.map(sale => (
                <div key={sale.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{sale.label}</p>
                    <p className="text-xs text-muted-foreground">{sale.cart.length} item{sale.cart.length !== 1 ? "s" : ""} • {formatCurrency(sale.cart.reduce((s, i) => s + i.selling_price * i.quantity, 0))}</p>
                    <p className="text-xs text-muted-foreground">{format(sale.timestamp, "HH:mm")}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="default" onClick={() => resumeSale(sale)} className="gap-1"><PlayCircle className="h-3 w-3" /> Resume</Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteHeldSale(sale.id)} className="text-destructive hover:text-destructive"><X className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
};

export default POS;
