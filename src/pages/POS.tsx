import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Search, ShoppingCart, X, Plus, Minus, Percent, DollarSign, Tag, ArrowLeft, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Product {
  id: string;
  name: string;
  selling_price: number;
  buying_price: number;
  stock: number;
  image_url: string | null;
  barcode: string | null;
  description: string | null;
  category: string;
}

interface CartItem extends Product {
  quantity: number;
}

interface QuickStats {
  salesToday: number;
  transactionsToday: number;
  topItem: string;
}
const POS = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
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
    salesToday: 0,
    transactionsToday: 0,
    topItem: "N/A"
  });
  const [discountType, setDiscountType] = useState<"percentage" | "fixed" | "promo">("percentage");
  const [discountValue, setDiscountValue] = useState<string>("");
  const [promoCode, setPromoCode] = useState<string>("");
  const [validatedPromo, setValidatedPromo] = useState<any>(null);
  const [customerName, setCustomerName] = useState<string>("");

  const categories = [
    "All Products",
    "Groceries",
    "Beverages",
    "Electronics",
    "Cosmetics & Beauty",
    "Household Items",
    "Stationery",
    "Snacks",
    "Hardware Tools",
    "Others"
  ];
  // Update time every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const formatted = now.toLocaleDateString("en-US", { 
        month: "long", 
        day: "numeric", 
        year: "numeric" 
      }) + ", " + now.toLocaleTimeString("en-US", { 
        hour: "2-digit", 
        minute: "2-digit" 
      });
      setCurrentTime(formatted);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchUserData();
    fetchProducts();
    fetchQuickStats();
  }, [user]);

  // Filter products by search and category
  useEffect(() => {
    let filtered = products;
    
    // Filter by category
    if (selectedCategory !== "All Products") {
      filtered = filtered.filter(product => 
        product.category === selectedCategory
      );
    }
    
    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(product => 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.barcode?.includes(searchTerm)
      );
    }
    
    setDisplayedProducts(filtered);
  }, [searchTerm, products, selectedCategory]);
  const fetchUserData = async () => {
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id, full_name")
      .eq("id", user.id)
      .single();
    
    if (profile) {
      setTenantId(profile.tenant_id);
      setUserName(profile.full_name || user.email?.split("@")[0] || "User");
    }
  };
  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .gt("stock", 0)
      .order("name");
    
    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch products",
        variant: "destructive"
      });
      return;
    }
    setProducts(data || []);
  };

  const fetchQuickStats = async () => {
    if (!tenantId) return;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data: transactions } = await supabase
      .from("transactions")
      .select("*")
      .eq("tenant_id", tenantId)
      .gte("created_at", today.toISOString());
    
    if (transactions) {
      const salesToday = transactions.reduce((sum, t) => sum + Number(t.total_amount), 0);
      const transactionsToday = transactions.length;
      
      // Find top item
      const itemCounts: { [key: string]: number } = {};
      transactions.forEach(t => {
        itemCounts[t.product_name] = (itemCounts[t.product_name] || 0) + t.quantity;
      });
      
      const topItem = Object.keys(itemCounts).length > 0
        ? Object.entries(itemCounts).sort((a, b) => b[1] - a[1])[0][0]
        : "N/A";
      
      setQuickStats({ salesToday, transactionsToday, topItem });
    }
  };

  const handleBarcodeScanned = async (barcode: string) => {
    const product = products.find(p => p.barcode === barcode);
    if (product) {
      addToCart(product);
      toast({
        title: "Product Found",
        description: `Added ${product.name} to cart`
      });
    } else {
      toast({
        title: "Not Found",
        description: "No product found with this barcode",
        variant: "destructive"
      });
    }
  };
  const addToCart = (product: Product) => {
    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
      if (existingItem.quantity >= product.stock) {
        toast({
          title: "Stock Limit",
          description: "Cannot add more than available stock",
          variant: "destructive"
        });
        return;
      }
      setCart(cart.map(item => item.id === product.id ? {
        ...item,
        quantity: item.quantity + 1
      } : item));
    } else {
      setCart([...cart, {
        ...product,
        quantity: 1
      }]);
    }
    setSearchTerm("");
  };
  const updateQuantity = (productId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.id === productId) {
        const newQuantity = item.quantity + delta;
        if (newQuantity <= 0) return null;
        if (newQuantity > item.stock) {
          toast({
            title: "Stock Limit",
            description: "Cannot exceed available stock",
            variant: "destructive"
          });
          return item;
        }
        return {
          ...item,
          quantity: newQuantity
        };
      }
      return item;
    }).filter(Boolean) as CartItem[]);
  };
  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.id !== productId));
  };

  const updateCartPrice = (productId: string, price: number) => {
    if (price < 0) return;
    setCart(cart.map(item => 
      item.id === productId ? { ...item, selling_price: price } : item
    ));
  };
  const calculateSubtotal = () => {
    return cart.reduce((sum, item) => sum + item.selling_price * item.quantity, 0);
  };

  const calculateDiscount = () => {
    const subtotal = calculateSubtotal();
    if (discountType === "promo" && validatedPromo) {
      if (validatedPromo.discount_type === "percentage") {
        return (subtotal * validatedPromo.discount_value) / 100;
      } else {
        return Math.min(validatedPromo.discount_value, subtotal);
      }
    } else if (discountType === "percentage" && discountValue) {
      const percent = parseFloat(discountValue);
      if (!isNaN(percent) && percent > 0 && percent <= 100) {
        return (subtotal * percent) / 100;
      }
    } else if (discountType === "fixed" && discountValue) {
      const amount = parseFloat(discountValue);
      if (!isNaN(amount) && amount > 0) {
        return Math.min(amount, subtotal);
      }
    }
    return 0;
  };

  const calculateTotal = () => {
    return calculateSubtotal() - calculateDiscount();
  };
  const calculateProfit = () => {
    const profit = cart.reduce((sum, item) => sum + (item.selling_price - item.buying_price) * item.quantity, 0);
    return profit - calculateDiscount();
  };

  const validatePromoCode = async () => {
    if (!promoCode.trim()) {
      toast({
        title: "Error",
        description: "Please enter a promo code",
        variant: "destructive"
      });
      return;
    }

    const { data, error } = await supabase
      .from("promo_codes")
      .select("*")
      .eq("code", promoCode.toUpperCase())
      .eq("is_active", true)
      .single();

    if (error || !data) {
      toast({
        title: "Invalid Code",
        description: "Promo code not found or inactive",
        variant: "destructive"
      });
      return;
    }

    // Check validity period
    const now = new Date();
    if (data.valid_until && new Date(data.valid_until) < now) {
      toast({
        title: "Expired",
        description: "This promo code has expired",
        variant: "destructive"
      });
      return;
    }

    // Check usage limit
    if (data.usage_limit && data.times_used >= data.usage_limit) {
      toast({
        title: "Limit Reached",
        description: "This promo code has reached its usage limit",
        variant: "destructive"
      });
      return;
    }

    setValidatedPromo(data);
    setDiscountType("promo");
    toast({
      title: "Success",
      description: `Applied ${data.discount_type === "percentage" ? data.discount_value + "%" : formatCurrency(data.discount_value)} discount`
    });
  };
  const handleCheckout = async () => {
    if (cart.length === 0) {
      toast({
        title: "Empty Cart",
        description: "Please add items to cart before checkout",
        variant: "destructive"
      });
      return;
    }
    if (!user || !tenantId) {
      toast({
        title: "Error",
        description: "User session not found",
        variant: "destructive"
      });
      return;
    }
    setLoading(true);
    try {
      const discountAmount = calculateDiscount();
      const subtotal = calculateSubtotal();
      
      // Update promo code usage if applied
      if (discountType === "promo" && validatedPromo) {
        await supabase
          .from("promo_codes")
          .update({ times_used: validatedPromo.times_used + 1 })
          .eq("id", validatedPromo.id);
      }

      // Process each cart item as a separate transaction
      for (const item of cart) {
        const itemSubtotal = item.selling_price * item.quantity;
        const itemDiscountRatio = subtotal > 0 ? itemSubtotal / subtotal : 0;
        const itemDiscount = discountAmount * itemDiscountRatio;
        const totalAmount = itemSubtotal - itemDiscount;
        const profit = (item.selling_price - item.buying_price) * item.quantity - itemDiscount;

        // Record transaction
        const {
          error: transactionError
        } = await supabase.from("transactions").insert({
          tenant_id: tenantId,
          product_id: item.id,
          product_name: item.name,
          quantity: item.quantity,
          unit_price: item.selling_price,
          total_amount: totalAmount,
          profit: profit,
          payment_method: paymentMethod,
          created_by: user.id,
          discount_type: discountAmount > 0 ? discountType : null,
          discount_value: discountAmount > 0 ? (discountType === "promo" ? validatedPromo?.discount_value : parseFloat(discountValue)) : 0,
          promo_code: discountType === "promo" ? promoCode.toUpperCase() : null,
          discount_amount: itemDiscount
        });
        if (transactionError) throw transactionError;

        // Update product stock
        const {
          error: stockError
        } = await supabase.from("products").update({
          stock: item.stock - item.quantity
        }).eq("id", item.id);
        if (stockError) throw stockError;
      }
      toast({
        title: "Success",
        description: `Sale completed! Total: UGX ${calculateTotal().toLocaleString()}`
      });

      // Clear cart and refresh products
      setCart([]);
      setPaymentMethod("cash");
      setDiscountType("percentage");
      setDiscountValue("");
      setPromoCode("");
      setValidatedPromo(null);
      setCustomerName("");
      fetchProducts();
      fetchQuickStats();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to complete sale",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  const formatCurrency = (amount: number) => {
    return `UGX ${amount.toLocaleString()}`;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation Bar */}
      <header className="bg-primary text-primary-foreground shadow-lg">
        <div className="container mx-auto px-2 sm:px-4 py-3 sm:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate("/dashboard")}
              className="flex items-center gap-1 sm:gap-2 shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to Dashboard</span>
              <span className="sm:hidden">Back</span>
            </Button>
            <div className="flex items-center gap-2 min-w-0">
              <ShoppingCart className="h-5 w-5 sm:h-6 sm:w-6 shrink-0" />
              <h1 className="text-base sm:text-xl font-bold truncate">Shop POS</h1>
            </div>
          </div>
          <div className="hidden md:block text-center">
            <p className="text-sm font-medium whitespace-nowrap">{currentTime}</p>
          </div>
          <div className="flex items-center shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-10 h-10 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 p-0"
                >
                  <span className="font-semibold text-sm">
                    {userName.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Left Section - Product Catalog */}
          <div className="lg:col-span-2 space-y-4">
            {/* Search Bar */}
            <div className="bg-card rounded-lg shadow-sm p-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <BarcodeScanner onScan={handleBarcodeScanned} />
              </div>
            </div>

            {/* Category Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
              {categories.map((category) => (
                <Button
                  key={category}
                  variant={selectedCategory === category ? "default" : "outline"}
                  onClick={() => setSelectedCategory(category)}
                  className="whitespace-nowrap text-xs sm:text-sm shrink-0"
                  size="sm"
                >
                  {category}
                </Button>
              ))}
            </div>

            {/* Product Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {displayedProducts.map((product) => (
                <div
                  key={product.id}
                  className="bg-card rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                >
                  <div className="aspect-square bg-muted flex items-center justify-center">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ShoppingCart className="h-16 w-16 text-muted-foreground" />
                    )}
                  </div>
                  <div className="p-4 space-y-2">
                    <h3 className="font-semibold text-sm">{product.name}</h3>
                    <p className="text-lg font-bold text-primary">
                      {formatCurrency(product.selling_price)}
                    </p>
                    <Button
                      onClick={() => addToCart(product)}
                      className="w-full"
                      size="sm"
                    >
                      Add to Cart
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {displayedProducts.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No products found</p>
              </div>
            )}
          </div>

          {/* Right Section - Cart & Stats */}
          <div className="space-y-4">
            {/* Cart */}
            <div className="bg-card rounded-lg shadow-sm p-6">
              <h2 className="text-2xl font-bold mb-4">Cart</h2>

              {/* Cart Table */}
              <div className="space-y-4 mb-6">
                {cart.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Cart is empty</p>
                ) : (
                  <>
                    {/* Header */}
                    <div className="grid grid-cols-12 gap-2 text-sm font-semibold pb-2 border-b">
                      <div className="col-span-4">Item</div>
                      <div className="col-span-2 text-center">Qty</div>
                      <div className="col-span-3 text-right">Price</div>
                      <div className="col-span-3 text-right">Subtotal</div>
                    </div>

                    {/* Cart Items */}
                    {cart.map((item) => (
                      <div key={item.id} className="space-y-2 pb-2 border-b last:border-b-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{item.name}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeFromCart(item.id)}
                            className="h-6 w-6 p-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 w-7 p-0"
                              onClick={() => updateQuantity(item.id, -1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center text-sm">{item.quantity}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 w-7 p-0"
                              onClick={() => updateQuantity(item.id, 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">@</span>
                              <Input
                                type="number"
                                value={item.selling_price}
                                onChange={(e) => updateCartPrice(item.id, parseFloat(e.target.value) || 0)}
                                className={`w-24 h-7 text-sm ${item.selling_price < item.buying_price ? 'border-destructive text-destructive' : ''}`}
                                min="0"
                                step="1"
                              />
                            </div>
                            <span className={`text-xs ${item.selling_price < item.buying_price ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                              Cost: {formatCurrency(item.buying_price)}
                            </span>
                          </div>
                          <span className="ml-auto font-semibold text-sm">
                            {formatCurrency(item.selling_price * item.quantity)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* Summary */}
              <div className="space-y-2 border-t pt-4">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span className="font-semibold">{formatCurrency(calculateSubtotal())}</span>
                </div>
                {calculateDiscount() > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Discount</span>
                    <span className="font-semibold">-{formatCurrency(calculateDiscount())}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Total</span>
                  <span>{formatCurrency(calculateTotal())}</span>
                </div>
              </div>

              {/* Discount Section */}
              <div className="mt-4 space-y-3">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={discountType === "percentage" ? "default" : "outline"}
                    onClick={() => {
                      setDiscountType("percentage");
                      setValidatedPromo(null);
                    }}
                    className="flex-1"
                  >
                    <Percent className="h-4 w-4 mr-1" />
                    %
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={discountType === "fixed" ? "default" : "outline"}
                    onClick={() => {
                      setDiscountType("fixed");
                      setValidatedPromo(null);
                    }}
                    className="flex-1"
                  >
                    <DollarSign className="h-4 w-4 mr-1" />
                    UGX
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={discountType === "promo" ? "default" : "outline"}
                    onClick={() => setDiscountType("promo")}
                    className="flex-1"
                  >
                    <Tag className="h-4 w-4 mr-1" />
                    Code
                  </Button>
                </div>

                {discountType === "promo" ? (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter promo code"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                      disabled={validatedPromo !== null}
                    />
                    <Button
                      type="button"
                      onClick={validatedPromo ? () => {
                        setValidatedPromo(null);
                        setPromoCode("");
                      } : validatePromoCode}
                      variant={validatedPromo ? "destructive" : "default"}
                    >
                      {validatedPromo ? "Clear" : "Apply"}
                    </Button>
                  </div>
                ) : (
                  <Input
                    type="number"
                    placeholder={discountType === "percentage" ? "Enter %" : "Enter amount"}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    min="0"
                    max={discountType === "percentage" ? "100" : undefined}
                  />
                )}

                <Input 
                  placeholder="Customer Name (Optional)" 
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>

              {/* Payment Buttons */}
              <div className="mt-6 grid grid-cols-2 gap-2">
                <Button
                  variant={paymentMethod === "cash" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("cash")}
                  className="w-full"
                >
                  Cash
                </Button>
                <Button
                  variant={paymentMethod === "mobile_money" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("mobile_money")}
                  className="w-full"
                >
                  Mobile Money
                </Button>
                <Button
                  variant={paymentMethod === "card" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("card")}
                  className="w-full"
                >
                  Card
                </Button>
                <Button
                  variant={paymentMethod === "other" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("other")}
                  className="w-full"
                >
                  Other
                </Button>
              </div>

              {/* Checkout Button */}
              <Button
                onClick={handleCheckout}
                disabled={loading || cart.length === 0}
                className="w-full mt-4"
                size="lg"
              >
                {loading ? "Processing..." : "Complete Sale"}
              </Button>
            </div>

            {/* Quick Stats */}
            <div className="bg-card rounded-lg shadow-sm p-6">
              <h2 className="text-2xl font-bold mb-4">Quick Stats</h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Sales Today</span>
                  <span className="font-bold text-lg">
                    {formatCurrency(quickStats.salesToday)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Transactions</span>
                  <span className="font-bold text-lg">{quickStats.transactionsToday}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Top Item</span>
                  <span className="font-bold text-lg">{quickStats.topItem}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default POS;