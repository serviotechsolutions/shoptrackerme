import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { DollarSign, Plus, Eye, Users, ShoppingBag, FileText, Trash2, Search, UserPlus, CheckCircle, Clock } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import ReceiptGenerator from '@/components/ReceiptGenerator';
import { useUserRole } from '@/hooks/useUserRole';

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
  const { isAdmin } = useUserRole();
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
  const [productSearch, setProductSearch] = useState('');
  
  // Assign customer modal
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignPaymentId, setAssignPaymentId] = useState<string | null>(null);
  const [customerSearchAssign, setCustomerSearchAssign] = useState('');
  const [addNewCustomerMode, setAddNewCustomerMode] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [savingAssign, setSavingAssign] = useState(false);
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [newPayment, setNewPayment] = useState({
    customer_id: 'none',
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

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(productSearch.toLowerCase())
  );

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
          .order('name');
        if (productsData) setProducts(productsData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({ title: 'Error', description: 'Failed to load data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
      toast({ title: 'Out of stock', description: 'This product is out of stock', variant: 'destructive' });
      return;
    }
    if (!product.selling_price || Number(product.selling_price) <= 0) {
      toast({
        title: 'Missing selling price',
        description: `"${product.name}" has no selling price set. Please update it on the Products page before selling.`,
        variant: 'destructive'
      });
      return;
    }
    const existing = cart.find(item => item.product_id === product.id);
    if (existing) {
      if (existing.quantity >= product.stock) {
        toast({ title: 'Stock limit', description: 'Cannot add more than available stock', variant: 'destructive' });
        return;
      }
      setCart(cart.map(item => item.product_id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([...cart, { product_id: product.id, product_name: product.name, quantity: 1, price: Number(product.selling_price) }]);
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

  const updateCartPrice = (productId: string, price: number) => {
    if (price < 0) return;
    setCart(cart.map(item => item.product_id === productId ? { ...item, price } : item));
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
      const customerId = newPayment.customer_id === 'none' ? null : newPayment.customer_id;
      const selectedCustomer = customers.find(c => c.id === customerId);

      const { data: paymentData, error: paymentError } = await supabase
        .from('payments')
        .insert({
          tenant_id: tenantId,
          amount: totalAmount,
          payment_method: newPayment.payment_method,
          payment_status: 'completed',
          customer_id: customerId,
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
      setProductSearch('');
      setNewPayment({ customer_id: 'none', payment_method: 'cash', reference_number: '', notes: '' });
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

  const handleDeletePayment = async (paymentId: string) => {
    try {
      const { error } = await supabase.from('payments').delete().eq('id', paymentId);
      if (error) throw error;
      toast({ title: 'Success', description: 'Payment deleted successfully' });
      fetchData();
    } catch (error) {
      console.error('Error deleting payment:', error);
      toast({ title: 'Error', description: 'Failed to delete payment', variant: 'destructive' });
    }
  };

  // Assign customer to a pending payment
  const openAssignModal = (paymentId: string) => {
    setAssignPaymentId(paymentId);
    setCustomerSearchAssign('');
    setAddNewCustomerMode(false);
    setAssignModalOpen(true);
  };

  const handleAssignCustomerToPayment = async (customerId: string, custName: string) => {
    if (!assignPaymentId) return;
    setSavingAssign(true);
    try {
      const { error } = await supabase.from('payments').update({
        customer_id: customerId,
        customer_name: custName,
        payment_status: 'completed',
      }).eq('id', assignPaymentId);
      if (error) throw error;
      toast({ title: 'Customer Assigned', description: `Payment assigned to ${custName}` });
      setAssignModalOpen(false);
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSavingAssign(false);
    }
  };

  const handleCreateAndAssignCustomer = async () => {
    if (!newCustName.trim() || !tenantId || !assignPaymentId) return;
    setSavingAssign(true);
    try {
      const { data, error } = await supabase.from('customers').insert({
        tenant_id: tenantId,
        name: newCustName.trim(),
        phone: newCustPhone || null,
      }).select().single();
      if (error) throw error;
      await handleAssignCustomerToPayment(data.id, data.name);
      setAddNewCustomerMode(false);
      setNewCustName(''); setNewCustPhone('');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setSavingAssign(false);
    }
  };

  const filteredAssignCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearchAssign.toLowerCase()) ||
    (c.phone && c.phone.includes(customerSearchAssign))
  );

  const generateQuickReceipt = async (payment: Payment) => {
    const { data: items } = await supabase.from('payment_items').select('*').eq('payment_id', payment.id);
    if (!shopInfo) return;
    
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, 200] });
    
    const pageWidth = 80;
    let yPos = 10;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(shopInfo.name || 'Shop Name', pageWidth / 2, yPos, { align: 'center' });
    yPos += 6;

    if (shopInfo.address) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      const addressLines = doc.splitTextToSize(shopInfo.address, pageWidth - 10);
      addressLines.forEach((line: string) => {
        doc.text(line, pageWidth / 2, yPos, { align: 'center' });
        yPos += 4;
      });
    }

    if (shopInfo.phone) {
      doc.setFontSize(8);
      doc.text(`Tel: ${shopInfo.phone}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 4;
    }

    if (shopInfo.email) {
      doc.setFontSize(8);
      doc.text(`Email: ${shopInfo.email}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 4;
    }

    yPos += 2;
    doc.setLineWidth(0.5);
    doc.line(5, yPos, pageWidth - 5, yPos);
    yPos += 6;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('RECEIPT', pageWidth / 2, yPos, { align: 'center' });
    yPos += 6;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Date: ${format(new Date(payment.payment_date), 'MMM dd, yyyy HH:mm')}`, 5, yPos);
    yPos += 4;

    if (payment.reference_number) {
      doc.text(`Ref: ${payment.reference_number}`, 5, yPos);
      yPos += 4;
    }

    doc.text(`Payment: ${payment.payment_method.replace('_', ' ')}`, 5, yPos);
    yPos += 4;

    if (payment.customer_name) {
      doc.text(`Customer: ${payment.customer_name}`, 5, yPos);
      yPos += 4;
    }

    yPos += 2;
    doc.line(5, yPos, pageWidth - 5, yPos);
    yPos += 4;

    doc.setFont('helvetica', 'bold');
    doc.text('Item', 5, yPos);
    doc.text('Qty', 40, yPos);
    doc.text('Price', 50, yPos);
    doc.text('Total', 65, yPos);
    yPos += 4;
    doc.line(5, yPos, pageWidth - 5, yPos);
    yPos += 4;

    doc.setFont('helvetica', 'normal');
    (items || []).forEach((item: PaymentItem) => {
      const itemName = item.product_name.length > 15 ? item.product_name.substring(0, 15) + '...' : item.product_name;
      doc.text(itemName, 5, yPos);
      doc.text(item.quantity.toString(), 42, yPos);
      doc.text(item.price.toFixed(0), 50, yPos);
      doc.text(item.total_price.toFixed(0), 65, yPos);
      yPos += 4;
    });

    yPos += 2;
    doc.line(5, yPos, pageWidth - 5, yPos);
    yPos += 6;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL:', 5, yPos);
    doc.text(`UGX ${payment.amount.toLocaleString()}`, pageWidth - 5, yPos, { align: 'right' });
    yPos += 8;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Thank you for your business!', pageWidth / 2, yPos, { align: 'center' });
    yPos += 4;
    doc.text('Please come again', pageWidth / 2, yPos, { align: 'center' });

    doc.save(`receipt-${payment.reference_number || payment.id}.pdf`);
  };

  const getTotalRevenue = () => payments.reduce((sum, payment) => sum + payment.amount, 0);
  const pendingCount = payments.filter(p => p.payment_status === 'pending_customer').length;

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
                    <Input id="customer_phone" value={newCustomer.phone} onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })} placeholder="+256..." />
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

            <Dialog open={paymentDialogOpen} onOpenChange={(open) => {
              setPaymentDialogOpen(open);
              if (!open) {
                setCart([]);
                setProductSearch('');
                setNewPayment({ customer_id: 'none', payment_method: 'cash', reference_number: '', notes: '' });
              }
            }}>
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
                      <SelectTrigger className="bg-background"><SelectValue placeholder="Select customer (optional)" /></SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        <SelectItem value="none">Walk-in Customer</SelectItem>
                        {customers.map(customer => (<SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Add Products</Label>
                    <Input 
                      placeholder="Search products..." 
                      value={productSearch} 
                      onChange={e => setProductSearch(e.target.value)}
                      className="mb-2"
                    />
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border rounded-md p-2 bg-muted/30">
                      {filteredProducts.length === 0 ? (
                        <p className="col-span-2 text-center text-muted-foreground text-sm py-4">
                          {products.length === 0 ? 'No products available' : 'No products match your search'}
                        </p>
                      ) : (
                        filteredProducts.map(product => {
                          const noPrice = !product.selling_price || Number(product.selling_price) <= 0;
                          const disabled = product.stock <= 0 || noPrice;
                          return (
                            <Button
                              key={product.id}
                              variant="outline"
                              size="sm"
                              className={`justify-start text-left h-auto py-2 ${disabled ? 'opacity-60' : ''}`}
                              onClick={() => addToCart(product)}
                              disabled={disabled}
                              title={noPrice ? 'No selling price set' : undefined}
                            >
                              <ShoppingBag className="mr-2 h-3 w-3 flex-shrink-0" />
                              <div className="flex flex-col items-start overflow-hidden">
                                <span className="truncate w-full">{product.name}</span>
                                <span className={`text-xs ${noPrice ? 'text-destructive font-medium' : product.stock <= 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                                  {noPrice
                                    ? '⚠ No price set'
                                    : `UGX ${Number(product.selling_price).toLocaleString()} • ${product.stock <= 0 ? 'Out of stock' : `Stock: ${product.stock}`}`}
                                </span>
                              </div>
                            </Button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {cart.length > 0 && (
                    <div className="space-y-2">
                      <Label>Cart Items</Label>
                      <div className="border rounded-md p-2 space-y-2">
                        {cart.map(item => (
                          <div key={item.product_id} className="flex flex-col gap-2 pb-2 border-b last:border-b-0 last:pb-0">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{item.product_name}</span>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => removeFromCart(item.product_id)}>×</Button>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="flex items-center gap-1">
                                <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => updateCartQuantity(item.product_id, item.quantity - 1)}>-</Button>
                                <span className="w-8 text-center text-sm">{item.quantity}</span>
                                <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => updateCartQuantity(item.product_id, item.quantity + 1)}>+</Button>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-muted-foreground">@</span>
                                <Input
                                  type="number"
                                  value={item.price}
                                  onChange={e => updateCartPrice(item.product_id, parseFloat(e.target.value) || 0)}
                                  className="w-20 h-7 text-sm"
                                  min="0"
                                  step="1"
                                />
                              </div>
                              <span className="ml-auto font-medium text-sm">UGX {(item.price * item.quantity).toLocaleString()}</span>
                            </div>
                          </div>
                        ))}
                        <div className="border-t pt-2 flex justify-between font-bold">
                          <span>Total:</span><span>UGX {getCartTotal().toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Payment Method</Label>
                    <Select value={newPayment.payment_method} onValueChange={value => setNewPayment({ ...newPayment, payment_method: value })}>
                      <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="mobile_money">Mobile Money</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
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
                    Complete Payment (UGX {getCartTotal().toLocaleString()})
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">UGX {getTotalRevenue().toLocaleString()}</div>
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
              <CardTitle className="text-sm font-medium">Pending Customer</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
              <p className="text-xs text-muted-foreground">Need customer info</p>
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
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map(payment => (
                  <TableRow key={payment.id}>
                    <TableCell className="text-sm">{format(new Date(payment.payment_date || payment.created_at), 'MMM dd, yyyy HH:mm')}</TableCell>
                    <TableCell>
                      {payment.customer_name || (
                        <span className="text-muted-foreground italic">Walk-in</span>
                      )}
                    </TableCell>
                    <TableCell className="capitalize text-sm">{payment.payment_method.replace('_', ' ')}</TableCell>
                    <TableCell>
                      {payment.payment_status === 'completed' ? (
                        <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100">
                          <CheckCircle className="h-3 w-3 mr-1" /> Completed
                        </Badge>
                      ) : payment.payment_status === 'pending_customer' ? (
                        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 hover:bg-yellow-100 cursor-pointer" onClick={() => openAssignModal(payment.id)}>
                          <Clock className="h-3 w-3 mr-1" /> Assign Customer
                        </Badge>
                      ) : (
                        <Badge variant="outline">{payment.payment_status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">UGX {payment.amount.toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => viewPaymentDetails(payment)} title="View Details">
                          <Eye className="h-4 w-4" />
                        </Button>
                        {payment.payment_status === 'pending_customer' && (
                          <Button variant="ghost" size="sm" onClick={() => openAssignModal(payment.id)} title="Assign Customer" className="text-yellow-600 hover:text-yellow-700">
                            <UserPlus className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => generateQuickReceipt(payment)} title="Generate Receipt">
                          <FileText className="h-4 w-4" />
                        </Button>
                        {(isAdmin || payment.payment_status !== 'completed') && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" title="Delete Payment" className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Payment</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete this payment? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeletePayment(payment.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {payments.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No payments recorded yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Payment Details Dialog */}
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
                    <p className="text-muted-foreground">Status</p>
                    <p className="font-medium capitalize">{selectedPayment.payment_status === 'pending_customer' ? 'Pending Customer' : selectedPayment.payment_status}</p>
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
                          <TableCell className="text-right">UGX {item.price.toLocaleString()}</TableCell>
                          <TableCell className="text-right">UGX {item.total_price.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                      {selectedPaymentItems.length === 0 && (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No items (legacy payment)</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex justify-between items-center border-t pt-4">
                  <span className="text-lg font-bold">Total: UGX {selectedPayment.amount.toLocaleString()}</span>
                  <div className="flex gap-2">
                    {selectedPayment.payment_status === 'pending_customer' && (
                      <Button size="sm" variant="outline" onClick={() => { setDetailsDialogOpen(false); openAssignModal(selectedPayment.id); }}>
                        <UserPlus className="h-4 w-4 mr-1" /> Assign Customer
                      </Button>
                    )}
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
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Assign Customer Modal */}
        <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" /> Assign Customer
              </DialogTitle>
              <DialogDescription>Select or add a customer for this payment</DialogDescription>
            </DialogHeader>

            {!addNewCustomerMode ? (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search customers..."
                    value={customerSearchAssign}
                    onChange={e => setCustomerSearchAssign(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <div className="max-h-60 overflow-y-auto space-y-1 border rounded-lg p-2">
                  {filteredAssignCustomers.length === 0 ? (
                    <p className="text-center text-muted-foreground text-sm py-4">No customers found</p>
                  ) : (
                    filteredAssignCustomers.map(customer => (
                      <button
                        key={customer.id}
                        onClick={() => handleAssignCustomerToPayment(customer.id, customer.name)}
                        disabled={savingAssign}
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

                <Button variant="outline" className="w-full gap-2" onClick={() => setAddNewCustomerMode(true)}>
                  <UserPlus className="h-4 w-4" /> Add New Customer
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Customer Name *</Label>
                  <Input value={newCustName} onChange={e => setNewCustName(e.target.value)} placeholder="John Doe" />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={newCustPhone} onChange={e => setNewCustPhone(e.target.value)} placeholder="+256..." />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setAddNewCustomerMode(false)}>Back</Button>
                  <Button className="flex-1" onClick={handleCreateAndAssignCustomer} disabled={!newCustName.trim() || savingAssign}>
                    {savingAssign ? "Saving..." : "Save & Assign"}
                  </Button>
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
