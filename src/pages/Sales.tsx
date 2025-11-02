import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { ShoppingCart, Receipt } from 'lucide-react';
interface Product {
  id: string;
  name: string;
  selling_price: number;
  buying_price: number;
  stock: number;
}
interface Transaction {
  id: string;
  product_name: string;
  quantity: number;
  total_amount: number;
  profit: number;
  payment_method: string;
  created_at: string;
}
const Sales = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [tenantId, setTenantId] = useState('');
  const [userId, setUserId] = useState('');
  const {
    toast
  } = useToast();
  useEffect(() => {
    fetchUserData();
  }, []);
  useEffect(() => {
    if (tenantId) {
      fetchProducts();
      fetchRecentTransactions();
    }
  }, [tenantId]);
  const fetchUserData = async () => {
    const {
      data: {
        user
      }
    } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      const {
        data: profile
      } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
      if (profile) {
        setTenantId(profile.tenant_id);
      }
    }
  };
  const fetchProducts = async () => {
    const {
      data
    } = await supabase.from('products').select('*').gt('stock', 0).order('name');
    setProducts(data || []);
  };
  const fetchRecentTransactions = async () => {
    const {
      data
    } = await supabase.from('transactions').select('*').order('created_at', {
      ascending: false
    }).limit(10);
    setTransactions(data || []);
  };
  const handleSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) {
      toast({
        title: 'Error',
        description: 'Please select a product',
        variant: 'destructive'
      });
      return;
    }
    if (quantity > selectedProduct.stock) {
      toast({
        title: 'Error',
        description: 'Insufficient stock',
        variant: 'destructive'
      });
      return;
    }
    try {
      const totalAmount = selectedProduct.selling_price * quantity;
      const totalCost = selectedProduct.buying_price * quantity;
      const profit = totalAmount - totalCost;

      // Record transaction
      const {
        error: transactionError
      } = await supabase.from('transactions').insert([{
        tenant_id: tenantId,
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        quantity,
        unit_price: selectedProduct.selling_price,
        total_amount: totalAmount,
        profit,
        payment_method: paymentMethod,
        created_by: userId
      }]);
      if (transactionError) throw transactionError;

      // Update product stock
      const {
        error: stockError
      } = await supabase.from('products').update({
        stock: selectedProduct.stock - quantity
      }).eq('id', selectedProduct.id);
      if (stockError) throw stockError;
      toast({
        title: 'Success',
        description: `Sale recorded successfully! Profit: ${formatCurrency(profit)}`
      });

      // Reset form
      setSelectedProduct(null);
      setQuantity(1);
      setPaymentMethod('cash');
      fetchProducts();
      fetchRecentTransactions();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  };
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0
    }).format(amount);
  };
  const calculateTotal = () => {
    if (!selectedProduct) return 0;
    return selectedProduct.selling_price * quantity;
  };
  return <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-center">Record Sale</h1>
          <p className="text-muted-foreground text-center">Process new transactions</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Sale Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
                New Sale
              </CardTitle>
              <CardDescription>Select product and enter sale details</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSale} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="product">Product</Label>
                  <Select value={selectedProduct?.id} onValueChange={value => {
                  const product = products.find(p => p.id === value);
                  setSelectedProduct(product || null);
                }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map(product => <SelectItem key={product.id} value={product.id}>
                          {product.name} - {formatCurrency(product.selling_price)} ({product.stock} in stock)
                        </SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {selectedProduct && <>
                    <div className="space-y-2">
                      <Label htmlFor="quantity">Quantity</Label>
                      <Input id="quantity" type="number" min="1" max={selectedProduct.stock} value={quantity} onChange={e => setQuantity(parseInt(e.target.value) || 1)} required />
                      <p className="text-sm text-muted-foreground">
                        Available: {selectedProduct.stock} units
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="payment">Payment Method</Label>
                      <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="mobile_money">Mobile Money</SelectItem>
                          <SelectItem value="card">Card</SelectItem>
                          <SelectItem value="credit">Credit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="rounded-lg bg-primary/10 p-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Unit Price:</span>
                        <span className="font-medium">{formatCurrency(selectedProduct.selling_price)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Quantity:</span>
                        <span className="font-medium">{quantity}</span>
                      </div>
                      <div className="flex justify-between text-base font-bold pt-2 border-t">
                        <span>Total:</span>
                        <span className="text-primary">{formatCurrency(calculateTotal())}</span>
                      </div>
                    </div>

                    <Button type="submit" className="w-full" size="lg">
                      <Receipt className="mr-2 h-4 w-4" />
                      Complete Sale
                    </Button>
                  </>}
              </form>
            </CardContent>
          </Card>

          {/* Recent Transactions */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>Last 10 sales</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {transactions.length === 0 ? <p className="text-center text-muted-foreground py-8">
                    No transactions yet
                  </p> : transactions.map(transaction => <div key={transaction.id} className="flex justify-between items-start p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                      <div>
                        <p className="font-medium">{transaction.product_name}</p>
                        <p className="text-sm text-muted-foreground">
                          Qty: {transaction.quantity} × {formatCurrency(transaction.total_amount / transaction.quantity)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(transaction.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-primary">
                          {formatCurrency(transaction.total_amount)}
                        </p>
                        <p className="text-sm text-success">
                          +{formatCurrency(transaction.profit)}
                        </p>
                      </div>
                    </div>)}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>;
};
export default Sales;