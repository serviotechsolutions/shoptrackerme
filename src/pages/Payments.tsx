import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { DollarSign, Plus, Eye, Users, ShoppingBag } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import ReceiptGenerator from '@/components/ReceiptGenerator';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

interface Product {
  id: string;
  name: string;
  selling_price: number;
  stock: number;
}

interface PaymentItem {
  id: string;
  payment_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  price: number;
  total_price: number;
}

interface Payment {
  id: string;
  amount: number;
  payment_method: string;
  payment_status: string;
  reference_number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  payment_date: string;
  created_at: string;
  notes: string | null;
}

interface ShopInfo {
  name: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

interface CartItem {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
}

const Payments = () => {
  const { toast } = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [selectedPaymentItems, setSelectedPaymentItems] = useState<PaymentItem[]>([]);
  const [shopInfo, setShopInfo] = useState<ShopInfo | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [newPayment, setNewPayment] = useState({
    customer_id: '',
    payment_method: 'cash',
    reference_number: '',
    notes: ''
  });
  
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    email: '',
    address: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: profile } = await supabase.from('profiles').select('tenant_id').single();
      if (profile) {
        setTenantId(profile.tenant_id);
        
        const { data: tenant } = await supabase
          .from('tenants')
          .select('name, logo_url, address, phone, email')
          .eq('id', profile.tenant_id)
          .single();
        if (tenant) setShopInfo(tenant);

        const { data: paymentsData } = await supabase
          .from('payments')
          .select('*')
          .eq('tenant_id', profile.tenant_id)
          .order('created_at', { ascending: false });
        if (paymentsData) setPayments(paymentsData);

        const { data: customersData } = await supabase
          .from('customers')
          .select('*')
          .eq('tenant_id', profile.tenant_id)
          .order('name');
        if (customersData) setCustomers(customersData);

        const { data: productsData } = await supabase
          .from('products')
          .select('id, name, selling_price, stock')
          .eq('tenant_id', profile.tenant_id)
          .gt('stock', 0)
          .order('name');
        if (productsData) setProducts(productsData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.product_id === product.id);
    if (existing) {
      if (existing.quantity >= product.stock) {
        toast({ title: 'Stock limit', description: 'Cannot add more than available stock', variant: 'destructive' });
        return;
      }
      setCart(cart.map(item => item.product_id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([...cart, { product_id: product.id, product_name: product.name, quantity: 1, price: product.selling_price }]);
    }
  };

  const removeFromCart = (productId: string) => setCart(cart.filter(item => item.product_id !== productId));

  const updateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) { removeFromCart(productId); return; }
    const product = products.find(p => p.id === productId);
    if (product && quantity > product.stock) {
      toast({ title: 'Stock limit', description: 'Cannot add more than available stock', variant: 'destructive' });
      return;
    }
    setCart(cart.map(item => item.product_id === productId ? { ...item, quantity } : item));
  };

  const getCartTotal = () => cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleCreatePayment = async () => {
    try {
      if (cart.length === 0) {
        toast({ title: 'Validation Error', description: 'Please add at least one product', variant: 'destructive' });
        return;
      }
      if (!tenantId) throw new Error('Tenant ID not found');

      const totalAmount = getCartTotal();
      const selectedCustomer = customers.find(c => c.id === newPayment.customer_id);

      const { data: paymentData, error: paymentError } = await supabase
        .from('payments')
        .insert({
          tenant_id: tenantId,
          amount: totalAmount,
          payment_method: newPayment.payment_method,
          payment_status: 'completed',
          customer_id: newPayment.customer_id || null,
          customer_name: selectedCustomer?.name || null,
          reference_number: newPayment.reference_number || null,
          notes: newPayment.notes || null,
          payment_date: new Date().toISOString()
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      const paymentItems = cart.map(item => ({
        payment_id: paymentData.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        price: item.price,
        total_price: item.price * item.quantity
      }));

      const { error: itemsError } = await supabase.from('payment_items').insert(paymentItems);
      if (itemsError) throw itemsError;

      toast({ title: 'Success', description: 'Payment recorded successfully' });
      setPaymentDialogOpen(false);
      setCart([]);
      setNewPayment({ customer_id: '', payment_method: 'cash', reference_number: '', notes: '' });
      fetchData();
    } catch (error) {
      console.error('Error creating payment:', error);
      toast({ title: 'Error', description: 'Failed to record payment', variant: 'destructive' });
    }
  };

  const handleCreateCustomer = async () => {
    try {
      if (!newCustomer.name) {
        toast({ title: 'Validation Error', description: 'Customer name is required', variant: 'destructive' });
        return;
      }
      if (!tenantId) throw new Error('Tenant ID not found');

      const { error } = await supabase.from('customers').insert({
        tenant_id: tenantId,
        name: newCustomer.name,
        phone: newCustomer.phone || null,
        email: newCustomer.email || null,
        address: newCustomer.address || null
      });

      if (error) throw error;

      toast({ title: 'Success', description: 'Customer added successfully' });
      setCustomerDialogOpen(false);
      setNewCustomer({ name: '', phone: '', email: '', address: '' });
      fetchData();
    } catch (error) {
      console.error('Error creating customer:', error);
      toast({ title: 'Error', description: 'Failed to add customer', variant: 'destructive' });
    }
  };

  const viewPaymentDetails = async (payment: Payment) => {
    setSelectedPayment(payment);
    const { data: items } = await supabase.from('payment_items').select('*').eq('payment_id', payment.id);
    setSelectedPaymentItems(items || []);
    setDetailsDialogOpen(true);
  };

  const getTotalRevenue = () => payments.reduce((sum, payment) => sum + payment.amount, 0);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="font-bold tracking-tight text-xl">Payments</h1>
            <p className="text-muted-foreground">Track and manage payment transactions</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline"><Users className="mr-2 h-4 w-4" />Add Customer</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Customer</DialogTitle>
                  <DialogDescription>Add a new customer to your database</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer_name">Name *</Label>
                    <Input id="customer_name" value={newCustomer.name} onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })} placeholder="John Doe" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customer_phone">Phone</Label>
                    <Input id="customer_phone" value={newCustomer.phone} onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })} placeholder="+1234567890" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customer_email">Email</Label>
                    <Input id="customer_email" type="email" value={newCustomer.email} onChange={e => setNewCustomer({ ...newCustomer, email: e.target.value })} placeholder="john@example.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customer_address">Address</Label>
                    <Textarea id="customer_address" value={newCustomer.address} onChange={e => setNewCustomer({ ...newCustomer, address: e.target.value })} placeholder="Enter address" />
                  </div>
                  <Button onClick={handleCreateCustomer} className="w-full">Add Customer</Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" />Record Payment</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Record New Payment</DialogTitle>
                  <DialogDescription>Add products and complete the payment</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Customer</Label>
                    <Select value={newPayment.customer_id} onValueChange={value => setNewPayment({ ...newPayment, customer_id: value })}>
                      <SelectTrigger><SelectValue placeholder="Select customer (optional)" /></SelectTrigger>
                      <SelectContent>
                        {customers.map(customer => (<SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Add Products</Label>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border rounded-md p-2">
                      {products.map(product => (
                        <Button key={product.id} variant="outline" size="sm" className="justify-start" onClick={() => addToCart(product)}>
                          <ShoppingBag className="mr-2 h-3 w-3" />{product.name} - ${product.selling_price}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {cart.length > 0 && (
                    <div className="space-y-2">
                      <Label>Cart Items</Label>
                      <div className="border rounded-md p-2 space-y-2">
                        {cart.map(item => (
                          <div key={item.product_id} className="flex items-center justify-between">
                            <span className="text-sm">{item.product_name}</span>
                            <div className="flex items-center gap-2">
                              <Button variant="outline" size="sm" onClick={() => updateCartQuantity(item.product_id, item.quantity - 1)}>-</Button>
                              <span className="w-8 text-center">{item.quantity}</span>
                              <Button variant="outline" size="sm" onClick={() => updateCartQuantity(item.product_id, item.quantity + 1)}>+</Button>
                              <span className="w-20 text-right">${(item.price * item.quantity).toFixed(2)}</span>
                            </div>
                          </div>
                        ))}
                        <div className="border-t pt-2 flex justify-between font-bold">
                          <span>Total:</span><span>${getCartTotal().toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Payment Method</Label>
                    <Select value={newPayment.payment_method} onValueChange={value => setNewPayment({ ...newPayment, payment_method: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="mobile_money">Mobile Money</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reference_number">Transaction Reference</Label>
                    <Input id="reference_number" value={newPayment.reference_number} onChange={e => setNewPayment({ ...newPayment, reference_number: e.target.value })} placeholder="REF-12345" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea id="notes" value={newPayment.notes} onChange={e => setNewPayment({ ...newPayment, notes: e.target.value })} placeholder="Additional notes..." />
                  </div>

                  <Button onClick={handleCreatePayment} className="w-full" disabled={cart.length === 0}>
                    Complete Payment (${getCartTotal().toFixed(2)})
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${getTotalRevenue().toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">From all payments</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{payments.length}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{customers.length}</div>
              <p className="text-xs text-muted-foreground">Registered customers</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Payment History</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map(payment => (
                  <TableRow key={payment.id}>
                    <TableCell>{format(new Date(payment.payment_date || payment.created_at), 'MMM dd, yyyy HH:mm')}</TableCell>
                    <TableCell>{payment.customer_name || 'Walk-in'}</TableCell>
                    <TableCell className="capitalize">{payment.payment_method.replace('_', ' ')}</TableCell>
                    <TableCell>{payment.reference_number || '-'}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        payment.payment_status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : payment.payment_status === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      }`}>{payment.payment_status}</span>
                    </TableCell>
                    <TableCell className="text-right font-medium">${payment.amount.toFixed(2)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => viewPaymentDetails(payment)}><Eye className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {payments.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No payments recorded yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Payment Details</DialogTitle>
              <DialogDescription>View payment information and generate receipt</DialogDescription>
            </DialogHeader>
            {selectedPayment && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Date</p>
                    <p className="font-medium">{format(new Date(selectedPayment.payment_date || selectedPayment.created_at), 'MMM dd, yyyy HH:mm')}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Reference</p>
                    <p className="font-medium">{selectedPayment.reference_number || '-'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Customer</p>
                    <p className="font-medium">{selectedPayment.customer_name || 'Walk-in'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Payment Method</p>
                    <p className="font-medium capitalize">{selectedPayment.payment_method.replace('_', ' ')}</p>
                  </div>
                </div>

                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedPaymentItems.map(item => (
                        <TableRow key={item.id}>
                          <TableCell>{item.product_name}</TableCell>
                          <TableCell className="text-center">{item.quantity}</TableCell>
                          <TableCell className="text-right">${item.price.toFixed(2)}</TableCell>
                          <TableCell className="text-right">${item.total_price.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                      {selectedPaymentItems.length === 0 && (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No items (legacy payment)</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex justify-between items-center border-t pt-4">
                  <span className="text-lg font-bold">Total: ${selectedPayment.amount.toFixed(2)}</span>
                  {shopInfo && (
                    <ReceiptGenerator
                      data={{
                        payment_id: selectedPayment.id,
                        reference_number: selectedPayment.reference_number,
                        payment_date: selectedPayment.payment_date || selectedPayment.created_at,
                        payment_method: selectedPayment.payment_method,
                        total_amount: selectedPayment.amount,
                        customer_name: selectedPayment.customer_name,
                        items: selectedPaymentItems,
                        shop: shopInfo
                      }}
                    />
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Payments;
