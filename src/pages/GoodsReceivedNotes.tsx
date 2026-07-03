import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import {
  Plus, PackageCheck, FileText, ClipboardCheck, AlertTriangle,
  RotateCcw, Printer, Search, Filter,
} from "lucide-react";
import SellingPriceAdvisorDialog from "@/components/SellingPriceAdvisorDialog";
import { weightedAverageCost, evaluatePricing, DEFAULT_PRICING, type PricingReview, type PricingSettings } from "@/lib/pricing";

type Supplier = { id: string; name: string };
type PO = {
  id: string; po_number: string; supplier_id: string | null;
  status: string; total_amount: number; ordered_at: string;
};
type POItem = {
  id: string; product_id: string | null; product_name: string;
  quantity: number; unit_cost: number;
};
type GRN = {
  id: string; grn_number: string; status: string;
  received_date: string; total_value: number;
  purchase_order_id: string | null; supplier_id: string | null;
  notes: string | null; invoice_ref: string | null; delivery_note_ref: string | null;
  approved_at: string | null; reversed_at: string | null; reversal_reason: string | null;
  purchase_orders?: { po_number: string } | null;
  suppliers?: { name: string } | null;
};
type GRNItemDraft = {
  purchase_order_item_id: string | null;
  product_id: string | null;
  product_name: string;
  ordered_quantity: number;
  previously_received: number;
  received_quantity: number;
  unit_cost: number;
  excess_accepted: boolean;
};

const fmt = (n: number) => Number(n || 0).toLocaleString();

const GoodsReceivedNotes = () => {
  const [params] = useSearchParams();
  const presetPo = params.get("po");

  const { user } = useAuth();
  const { isAdmin, canManageProducts } = useUserRole();
  const canCreate = canManageProducts || isAdmin;

  const [loading, setLoading] = useState(true);
  const [grns, setGrns] = useState<GRN[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pos, setPos] = useState<PO[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [rangeFilter, setRangeFilter] = useState<string>("all");

  // Create dialog
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selPo, setSelPo] = useState<string>("");
  const [selSupplier, setSelSupplier] = useState<string>("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<GRNItemDraft[]>([]);

  // View / actions
  const [viewing, setViewing] = useState<GRN | null>(null);
  const [viewItems, setViewItems] = useState<any[]>([]);
  const [reverseOpen, setReverseOpen] = useState<GRN | null>(null);
  const [reverseReason, setReverseReason] = useState("");

  // Selling Price Advisor
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [advisorReviews, setAdvisorReviews] = useState<PricingReview[]>([]);

  const loadPricingSettings = async (tenantId: string): Promise<PricingSettings> => {
    const { data } = await (supabase as any).from("tenants")
      .select("min_profit_margin, price_rounding").eq("id", tenantId).maybeSingle();
    return {
      min_profit_margin: Number(data?.min_profit_margin ?? DEFAULT_PRICING.min_profit_margin),
      price_rounding: Number(data?.price_rounding ?? DEFAULT_PRICING.price_rounding),
    };
  };

  const load = async () => {
    setLoading(true);
    const [{ data: g }, { data: sups }, { data: posData }] = await Promise.all([
      (supabase as any)
        .from("goods_received_notes")
        .select("*, purchase_orders(po_number), suppliers(name)")
        .order("created_at", { ascending: false }),
      (supabase as any).from("suppliers").select("id,name").eq("status", "active").order("name"),
      (supabase as any).from("purchase_orders").select("*").in("status", ["approved", "received"]).order("created_at", { ascending: false }),
    ]);
    setGrns((g || []) as GRN[]);
    setSuppliers((sups || []) as Supplier[]);
    setPos((posData || []) as PO[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Load items when a PO is selected (sum previously-received from prior approved GRNs)
  const loadPoItems = async (poId: string) => {
    const po = pos.find(p => p.id === poId);
    if (!po) return;
    setSelSupplier(po.supplier_id || "");
    const { data: poItems } = await (supabase as any)
      .from("purchase_order_items")
      .select("*")
      .eq("purchase_order_id", poId);
    // previously received per product (approved GRNs for this PO)
    const { data: priorGrns } = await (supabase as any)
      .from("goods_received_notes")
      .select("id")
      .eq("purchase_order_id", poId)
      .eq("status", "approved");
    const priorIds = (priorGrns || []).map((x: any) => x.id);
    let priorItems: any[] = [];
    if (priorIds.length) {
      const { data } = await (supabase as any)
        .from("grn_items")
        .select("purchase_order_item_id, received_quantity")
        .in("grn_id", priorIds);
      priorItems = data || [];
    }
    const prevMap = new Map<string, number>();
    for (const r of priorItems) {
      prevMap.set(r.purchase_order_item_id, (prevMap.get(r.purchase_order_item_id) || 0) + Number(r.received_quantity || 0));
    }
    const drafts: GRNItemDraft[] = (poItems || []).map((it: POItem) => {
      const prev = prevMap.get(it.id) || 0;
      const remaining = Math.max(0, Number(it.quantity) - prev);
      return {
        purchase_order_item_id: it.id,
        product_id: it.product_id,
        product_name: it.product_name,
        ordered_quantity: Number(it.quantity),
        previously_received: prev,
        received_quantity: remaining,
        unit_cost: Number(it.unit_cost),
        excess_accepted: false,
      };
    });
    setItems(drafts);
  };

  useEffect(() => {
    if (open && presetPo && pos.length && !selPo) {
      setSelPo(presetPo);
      loadPoItems(presetPo);
    }
  }, [open, presetPo, pos]);

  const openCreate = () => {
    setSelPo(""); setSelSupplier(""); setInvoiceRef(""); setDeliveryNote("");
    setNotes(""); setItems([]); setOpen(true);
  };

  const onPickPo = (v: string) => { setSelPo(v); loadPoItems(v); };

  const updateItem = (i: number, patch: Partial<GRNItemDraft>) =>
    setItems(arr => arr.map((it, idx) => idx === i ? { ...it, ...patch } : it));

  const totalValue = useMemo(
    () => items.reduce((s, i) => s + Number(i.received_quantity || 0) * Number(i.unit_cost || 0), 0),
    [items]
  );

  const hasShortage = items.some(i => i.received_quantity < (i.ordered_quantity - i.previously_received));
  const hasExcess = items.some(i => i.received_quantity > (i.ordered_quantity - i.previously_received));
  const unresolvedExcess = items.some(i =>
    i.received_quantity > (i.ordered_quantity - i.previously_received) && !i.excess_accepted
  );

  const save = async (status: "draft" | "approved") => {
    if (!selSupplier) { toast.error("Pick a supplier"); return; }
    if (items.length === 0) { toast.error("No items to receive"); return; }
    if (items.every(i => !i.received_quantity)) { toast.error("Enter received quantities"); return; }
    if (status === "approved" && unresolvedExcess) {
      toast.error("Approve or reject excess deliveries before approving the GRN");
      return;
    }
    setSaving(true);
    try {
      const { data: profile } = await supabase
        .from("profiles").select("tenant_id").eq("id", user!.id).maybeSingle();
      const tenant_id = profile?.tenant_id;
      if (!tenant_id) throw new Error("No tenant");

      const grn_number = `GRN-${Date.now().toString().slice(-7)}`;
      const { data: grn, error } = await (supabase as any)
        .from("goods_received_notes")
        .insert({
          tenant_id, purchase_order_id: selPo || null, supplier_id: selSupplier,
          grn_number, status,
          received_date: new Date().toISOString(),
          received_by: user!.id, created_by: user!.id,
          approved_by: status === "approved" ? user!.id : null,
          approved_at: status === "approved" ? new Date().toISOString() : null,
          total_value: totalValue,
          notes: notes || null,
          invoice_ref: invoiceRef || null,
          delivery_note_ref: deliveryNote || null,
        })
        .select().single();
      if (error) throw error;

      const rows = items.map(i => ({
        grn_id: grn.id,
        purchase_order_item_id: i.purchase_order_item_id,
        product_id: i.product_id,
        product_name: i.product_name,
        ordered_quantity: i.ordered_quantity,
        received_quantity: Number(i.received_quantity || 0),
        previously_received: i.previously_received,
        unit_cost: Number(i.unit_cost || 0),
        total_cost: Number(i.received_quantity || 0) * Number(i.unit_cost || 0),
        excess_accepted: i.excess_accepted,
      }));
      const { error: itErr } = await (supabase as any).from("grn_items").insert(rows);
      if (itErr) throw itErr;

      if (status === "approved") {
        const createdCount = await applyStockMovement(rows, +1, tenant_id, selSupplier || null, grn.id);
        await maybeMarkPoReceived(selPo);
        if (createdCount > 0) {
          toast.success(`${createdCount} new product${createdCount > 1 ? "s" : ""} added to inventory`);
        }
      }

      await (supabase as any).from("grn_audit_log").insert({
        grn_id: grn.id, tenant_id, user_id: user!.id,
        action: status === "approved" ? "created_and_approved" : "created_draft",
        details: { total_value: totalValue, items: rows.length },
      });

      toast.success(status === "approved" ? "GRN approved & stock updated" : "GRN saved as draft");
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Applies stock movement + weighted-average cost update + purchase-history logging.
  // Returns list of pricing reviews (for advisor) and count of auto-created products.
  const applyStockMovement = async (
    rows: any[],
    direction: 1 | -1,
    tenantId?: string,
    supplierId?: string | null,
    grnId?: string,
    purchaseOrderId?: string | null,
  ): Promise<{ created: number; reviews: PricingReview[] }> => {
    let created = 0;
    const reviews: PricingReview[] = [];
    const settings = tenantId ? await loadPricingSettings(tenantId) : DEFAULT_PRICING;

    for (const r of rows) {
      if (!r.received_quantity) continue;
      let productId: string | null = r.product_id;

      // Auto-create the product if it doesn't exist in inventory yet.
      if (!productId && direction === 1 && tenantId && r.product_name) {
        const { data: existing } = await supabase
          .from("products")
          .select("id")
          .eq("tenant_id", tenantId)
          .ilike("name", r.product_name.trim())
          .maybeSingle();
        if (existing?.id) {
          productId = existing.id;
        } else {
          const { data: newProd, error: pErr } = await supabase
            .from("products")
            .insert({
              tenant_id: tenantId,
              name: r.product_name.trim(),
              buying_price: Number(r.unit_cost || 0),
              selling_price: 0,
              stock: 0,
              preferred_supplier_id: supplierId || null,
              last_purchase_price: Number(r.unit_cost || 0),
              average_cost: Number(r.unit_cost || 0),
              last_purchase_date: new Date().toISOString(),
            } as any)
            .select("id")
            .single();
          if (pErr || !newProd) continue;
          productId = newProd.id;
          created += 1;
        }
        if (grnId && productId) {
          await (supabase as any).from("grn_items")
            .update({ product_id: productId }).eq("id", r.id);
        }
      }

      if (!productId) continue;

      const { data: prod } = await supabase
        .from("products")
        .select("id,name,stock,average_cost,selling_price,buying_price,last_purchase_price")
        .eq("id", productId)
        .maybeSingle();
      if (!prod) continue;

      const prevStock = Number(prod.stock || 0);
      const prevAvg = Number((prod as any).average_cost || prod.last_purchase_price || prod.buying_price || 0);
      const qty = Number(r.received_quantity);
      const unitCost = Number(r.unit_cost || 0);
      const newStock = Math.max(0, prevStock + direction * qty);

      let newAvg = prevAvg;
      if (direction === 1) {
        newAvg = weightedAverageCost(prevStock, prevAvg, qty, unitCost);
      } else if (newStock === 0) {
        // On full reversal, keep previous avg cost as historical reference — don't reset.
        newAvg = prevAvg;
      }

      const update: any = { stock: newStock, average_cost: newAvg };
      if (direction === 1) {
        update.last_purchase_price = unitCost;
        update.last_purchase_date = new Date().toISOString();
      }
      await supabase.from("products").update(update).eq("id", productId);

      // Log purchase history (only on inbound movement)
      if (direction === 1 && tenantId) {
        await (supabase as any).from("product_purchase_history").insert({
          tenant_id: tenantId,
          product_id: productId,
          supplier_id: supplierId || null,
          grn_id: grnId || null,
          purchase_order_id: purchaseOrderId || null,
          quantity: qty,
          unit_cost: unitCost,
          previous_stock: prevStock,
          previous_average_cost: prevAvg,
          new_stock: newStock,
          new_average_cost: newAvg,
        });

        reviews.push(
          evaluatePricing({
            productId,
            productName: prod.name,
            previousAverageCost: prevAvg,
            newAverageCost: newAvg,
            currentSellingPrice: Number(prod.selling_price || 0),
            settings,
          }),
        );
      }
    }
    return { created, reviews };
  };

  const maybeMarkPoReceived = async (poId: string | null) => {
    if (!poId) return;
    const { data: poItems } = await (supabase as any)
      .from("purchase_order_items").select("id,quantity").eq("purchase_order_id", poId);
    const { data: gids } = await (supabase as any)
      .from("goods_received_notes").select("id").eq("purchase_order_id", poId).eq("status", "approved");
    const ids = (gids || []).map((g: any) => g.id);
    if (!ids.length) return;
    const { data: rcv } = await (supabase as any)
      .from("grn_items").select("purchase_order_item_id, received_quantity").in("grn_id", ids);
    const sumMap = new Map<string, number>();
    for (const r of (rcv || [])) {
      sumMap.set(r.purchase_order_item_id, (sumMap.get(r.purchase_order_item_id) || 0) + Number(r.received_quantity));
    }
    const fullyReceived = (poItems || []).every((it: any) =>
      (sumMap.get(it.id) || 0) >= Number(it.quantity));
    if (fullyReceived) {
      await (supabase as any).from("purchase_orders")
        .update({ status: "received", received_at: new Date().toISOString() })
        .eq("id", poId);
    }
  };

  const approveDraft = async (g: GRN) => {
    const { data: rows } = await (supabase as any)
      .from("grn_items").select("*").eq("grn_id", g.id);
    if (!rows?.length) { toast.error("No items"); return; }
    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user!.id).maybeSingle();
    const created = await applyStockMovement(rows, +1, profile?.tenant_id, g.supplier_id, g.id);
    await (supabase as any).from("goods_received_notes").update({
      status: "approved", approved_by: user!.id, approved_at: new Date().toISOString(),
    }).eq("id", g.id);
    await maybeMarkPoReceived(g.purchase_order_id);
    await (supabase as any).from("grn_audit_log").insert({
      grn_id: g.id, tenant_id: profile?.tenant_id, user_id: user!.id, action: "approved",
      details: { created_products: created },
    });
    if (created > 0) toast.success(`${created} new product${created > 1 ? "s" : ""} added to inventory`);
    toast.success("GRN approved");
    load();
  };

  const doReverse = async () => {
    if (!reverseOpen) return;
    if (!reverseReason.trim()) { toast.error("Reason is required"); return; }
    const g = reverseOpen;
    const { data: rows } = await (supabase as any).from("grn_items").select("*").eq("grn_id", g.id);
    if (g.status === "approved") await applyStockMovement(rows || [], -1);
    await (supabase as any).from("goods_received_notes").update({
      status: "reversed", reversed_by: user!.id,
      reversed_at: new Date().toISOString(), reversal_reason: reverseReason,
    }).eq("id", g.id);
    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user!.id).maybeSingle();
    await (supabase as any).from("grn_audit_log").insert({
      grn_id: g.id, tenant_id: profile?.tenant_id, user_id: user!.id,
      action: "reversed", details: { reason: reverseReason },
    });
    toast.success("GRN reversed");
    setReverseOpen(null); setReverseReason("");
    load();
  };

  const openView = async (g: GRN) => {
    setViewing(g);
    const { data } = await (supabase as any).from("grn_items").select("*").eq("grn_id", g.id);
    setViewItems(data || []);
  };

  // Filters & metrics
  const filtered = useMemo(() => {
    const now = Date.now();
    return grns.filter(g => {
      if (statusFilter !== "all" && g.status !== statusFilter) return false;
      if (search && !`${g.grn_number} ${g.suppliers?.name || ""} ${g.purchase_orders?.po_number || ""}`
        .toLowerCase().includes(search.toLowerCase())) return false;
      if (rangeFilter !== "all") {
        const d = new Date(g.received_date).getTime();
        const days = rangeFilter === "today" ? 1 : rangeFilter === "week" ? 7 : rangeFilter === "month" ? 30 : 365;
        if (now - d > days * 86400000) return false;
      }
      return true;
    });
  }, [grns, search, statusFilter, rangeFilter]);

  const metrics = useMemo(() => {
    const approved = grns.filter(g => g.status === "approved");
    const draft = grns.filter(g => g.status === "draft");
    const totalValue = approved.reduce((s, g) => s + Number(g.total_value), 0);
    return {
      total: grns.length,
      pending: draft.length,
      approved: approved.length,
      reversed: grns.filter(g => g.status === "reversed").length,
      totalValue,
    };
  }, [grns]);

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <PackageCheck className="h-6 w-6 text-primary" /> Goods Received Notes
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Record actual deliveries, handle shortages and excess, and keep inventory accurate.
            </p>
          </div>
          {canCreate && <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />New GRN</Button>}
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total GRNs", value: metrics.total, icon: FileText },
            { label: "Pending", value: metrics.pending, icon: ClipboardCheck },
            { label: "Approved", value: metrics.approved, icon: PackageCheck },
            { label: "Reversed", value: metrics.reversed, icon: RotateCcw },
            { label: "Stock Value", value: fmt(metrics.totalValue), icon: AlertTriangle },
          ].map(m => (
            <Card key={m.label}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{m.label}</p>
                    <p className="text-lg sm:text-xl font-bold">{m.value}</p>
                  </div>
                  <m.icon className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search GRN, supplier or PO" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="sm:w-40"><Filter className="h-4 w-4 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="reversed">Reversed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={rangeFilter} onValueChange={setRangeFilter}>
            <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This week</SelectItem>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="year">This year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="p-10 text-center text-muted-foreground">
            <PackageCheck className="h-10 w-10 mx-auto mb-2 opacity-50" />
            No goods received notes yet.
          </CardContent></Card>
        ) : (
          <div className="grid gap-2">
            {filtered.map(g => (
              <Card key={g.id} className="cursor-pointer hover:bg-muted/30" onClick={() => openView(g)}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{g.grn_number}</p>
                        <Badge variant={g.status === "approved" ? "default" : g.status === "reversed" ? "destructive" : "outline"}>
                          {g.status}
                        </Badge>
                        {g.purchase_orders?.po_number && <Badge variant="secondary">{g.purchase_orders.po_number}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {g.suppliers?.name || "—"} · {new Date(g.received_date).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{fmt(g.total_value)}</p>
                      <p className="text-xs text-muted-foreground">Total value</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create GRN dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Goods Received Note</DialogTitle>
            <DialogDescription>Record what was actually delivered. Stock updates only after approval.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Purchase Order (optional)</Label>
                <Select value={selPo} onValueChange={onPickPo}>
                  <SelectTrigger><SelectValue placeholder="Link to PO" /></SelectTrigger>
                  <SelectContent>
                    {pos.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground">No open POs</div>
                    ) : pos.map(p => <SelectItem key={p.id} value={p.id}>{p.po_number}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Supplier *</Label>
                <Select value={selSupplier} onValueChange={setSelSupplier}>
                  <SelectTrigger><SelectValue placeholder="Choose supplier" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Invoice Reference</Label>
                <Input value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} placeholder="INV-1234" />
              </div>
              <div>
                <Label className="text-xs">Delivery Note Ref</Label>
                <Input value={deliveryNote} onChange={e => setDeliveryNote(e.target.value)} placeholder="DN-001" />
              </div>
            </div>

            <div>
              <Label className="text-xs">Items</Label>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4 border rounded">
                  Select a PO above to auto-load items.
                </p>
              ) : (
                <div className="space-y-2">
                  {items.map((it, i) => {
                    const remaining = it.ordered_quantity - it.previously_received;
                    const diff = it.received_quantity - remaining;
                    const shortage = diff < 0 ? -diff : 0;
                    const excess = diff > 0 ? diff : 0;
                    return (
                      <div key={i} className="p-3 border rounded space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="font-medium text-sm truncate">{it.product_name}</p>
                            {!it.product_id && (
                              <Badge variant="outline" className="text-[10px] border-primary text-primary shrink-0">
                                will create
                              </Badge>
                            )}
                          </div>
                          <div className="flex gap-1 text-xs">
                            <Badge variant="outline">Ordered: {it.ordered_quantity}</Badge>
                            {it.previously_received > 0 && <Badge variant="secondary">Prev: {it.previously_received}</Badge>}
                            <Badge variant="outline">Remaining: {remaining}</Badge>
                          </div>
                        </div>
                        <div className="grid grid-cols-12 gap-2">
                          <div className="col-span-6 sm:col-span-3">
                            <Label className="text-[10px]">Received now</Label>
                            <Input type="number" min={0} value={it.received_quantity}
                              onChange={e => updateItem(i, { received_quantity: Number(e.target.value) })} />
                          </div>
                          <div className="col-span-6 sm:col-span-3">
                            <Label className="text-[10px]">Unit cost</Label>
                            <Input type="number" min={0} value={it.unit_cost}
                              onChange={e => updateItem(i, { unit_cost: Number(e.target.value) })} />
                          </div>
                          <div className="col-span-12 sm:col-span-6 flex items-end justify-end">
                            <p className="text-sm font-semibold">
                              {fmt(it.received_quantity * it.unit_cost)}
                            </p>
                          </div>
                        </div>
                        {shortage > 0 && (
                          <p className="text-xs text-orange-600 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Shortage of {shortage} unit(s)
                          </p>
                        )}
                        {excess > 0 && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-amber-600 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Excess of {excess} unit(s)
                            </span>
                            <div className="flex gap-2">
                              <Button size="sm" variant={it.excess_accepted ? "default" : "outline"}
                                onClick={() => updateItem(i, { excess_accepted: true })}>Accept</Button>
                              <Button size="sm" variant={!it.excess_accepted ? "default" : "outline"}
                                onClick={() => updateItem(i, { excess_accepted: false, received_quantity: remaining })}>
                                Reject
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center py-2 border-t">
              <div className="flex gap-2 text-xs">
                {hasShortage && <Badge variant="outline" className="border-orange-500 text-orange-600">Has shortage</Badge>}
                {hasExcess && <Badge variant="outline" className="border-amber-500 text-amber-600">Has excess</Badge>}
              </div>
              <span className="text-xl font-bold">{fmt(totalValue)}</span>
            </div>

            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="secondary" onClick={() => save("draft")} disabled={saving}>Save draft</Button>
            {isAdmin && (
              <Button onClick={() => save("approved")} disabled={saving}>Approve & update stock</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View GRN dialog */}
      <Dialog open={!!viewing} onOpenChange={v => !v && setViewing(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto print:max-w-none print:shadow-none">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <PackageCheck className="h-5 w-5" /> {viewing.grn_number}
                  <Badge>{viewing.status}</Badge>
                </DialogTitle>
                <DialogDescription>
                  {viewing.suppliers?.name} · {new Date(viewing.received_date).toLocaleString()}
                  {viewing.purchase_orders?.po_number && ` · PO ${viewing.purchase_orders.po_number}`}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Invoice:</span> {viewing.invoice_ref || "—"}</div>
                  <div><span className="text-muted-foreground">Delivery note:</span> {viewing.delivery_note_ref || "—"}</div>
                </div>
                <div className="border rounded overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-2">Product</th>
                        <th className="text-right p-2">Ordered</th>
                        <th className="text-right p-2">Received</th>
                        <th className="text-right p-2">Unit</th>
                        <th className="text-right p-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewItems.map((it, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">{it.product_name}</td>
                          <td className="p-2 text-right">{it.ordered_quantity}</td>
                          <td className="p-2 text-right">{it.received_quantity}</td>
                          <td className="p-2 text-right">{fmt(it.unit_cost)}</td>
                          <td className="p-2 text-right">{fmt(it.total_cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t font-semibold">
                        <td className="p-2" colSpan={4}>Total</td>
                        <td className="p-2 text-right">{fmt(viewing.total_value)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {viewing.notes && <p className="text-sm text-muted-foreground">Notes: {viewing.notes}</p>}
                {viewing.reversal_reason && (
                  <p className="text-sm text-destructive">Reversed: {viewing.reversal_reason}</p>
                )}
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2 print:hidden">
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="h-4 w-4 mr-1" />Print
                </Button>
                {isAdmin && viewing.status === "draft" && (
                  <Button onClick={() => { approveDraft(viewing); setViewing(null); }}>
                    Approve
                  </Button>
                )}
                {isAdmin && viewing.status !== "reversed" && (
                  <Button variant="destructive" onClick={() => { setReverseOpen(viewing); setViewing(null); }}>
                    <RotateCcw className="h-4 w-4 mr-1" />Reverse
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reverse dialog */}
      <Dialog open={!!reverseOpen} onOpenChange={v => !v && setReverseOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reverse GRN</DialogTitle>
            <DialogDescription>
              This will reverse stock adjustments and mark the GRN as reversed. A reason is required.
            </DialogDescription>
          </DialogHeader>
          <Textarea placeholder="Reason for reversal" value={reverseReason} onChange={e => setReverseReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseOpen(null)}>Cancel</Button>
            <Button variant="destructive" onClick={doReverse}>Reverse GRN</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default GoodsReceivedNotes;
