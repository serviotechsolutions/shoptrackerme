import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { DollarSign, Plus } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';

interface Payment {
  id: string;
  amount: number;
  payment_method: string;
  payment_status: string;
  reference_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  created_at: string;
}

const Payments = () => {
  const { toast } = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [newPayment, setNewPayment] = useState({
    amount: '',
    payment_method: 'cash',
    customer_name: '',
    customer_phone: '',
    reference_number: '',
    notes: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: profile } = await supabase.from('profiles').select('tenant_id').single();
      if (profile) {
        const { data: paymentsData } = await supabase
          .from('payments')
          .select('*')
          .eq('tenant_id', profile.tenant_id)
          .order('created_at', { ascending: false });

        if (paymentsData) setPayments(paymentsData);
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

  const handleCreatePayment = async () => {
    try {
      if (!newPayment.amount) {
        toast({
          title: 'Validation Error',
          description: 'Please enter an amount',
          variant: 'destructive'
        });
        return;
      }

      const { data: profile } = await supabase.from('profiles').select('tenant_id').single();
      if (!profile) throw new Error('Could not fetch profile');

      const { error } = await supabase.from('payments').insert({
        tenant_id: profile.tenant_id,
        amount: parseFloat(newPayment.amount),
        payment_method: newPayment.payment_method,
        payment_status: 'completed',
        customer_name: newPayment.customer_name || null,
        customer_phone: newPayment.customer_phone || null,
        reference_number: newPayment.reference_number || null,
        notes: newPayment.notes || null
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Payment recorded successfully'
      });

      setPaymentDialogOpen(false);
      setNewPayment({
        amount: '',
        payment_method: 'cash',
        customer_name: '',
        customer_phone: '',
        reference_number: '',
        notes: ''
      });
      fetchData();
    } catch (error) {
      console.error('Error creating payment:', error);
      toast({
        title: 'Error',
        description: 'Failed to record payment',
        variant: 'destructive'
      });
    }
  };

  const getTotalRevenue = () => {
    return payments.reduce((sum, payment) => sum + payment.amount, 0);
  };

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bold tracking-tight text-xl">Payments</h1>
            <p className="text-muted-foreground">Track and manage payment transactions</p>
          </div>
          <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Record Payment
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record New Payment</DialogTitle>
                <DialogDescription>Add a new payment transaction</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    value={newPayment.amount}
                    onChange={e => setNewPayment({ ...newPayment, amount: e.target.value })}
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payment_method">Payment Method</Label>
                  <Select
                    value={newPayment.payment_method}
                    onValueChange={value => setNewPayment({ ...newPayment, payment_method: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="mobile_money">Mobile Money</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customer_name">Customer Name</Label>
                  <Input
                    id="customer_name"
                    value={newPayment.customer_name}
                    onChange={e => setNewPayment({ ...newPayment, customer_name: e.target.value })}
                    placeholder="John Doe"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customer_phone">Customer Phone</Label>
                  <Input
                    id="customer_phone"
                    value={newPayment.customer_phone}
                    onChange={e => setNewPayment({ ...newPayment, customer_phone: e.target.value })}
                    placeholder="+1234567890"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reference_number">Reference Number</Label>
                  <Input
                    id="reference_number"
                    value={newPayment.reference_number}
                    onChange={e => setNewPayment({ ...newPayment, reference_number: e.target.value })}
                    placeholder="REF-12345"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={newPayment.notes}
                    onChange={e => setNewPayment({ ...newPayment, notes: e.target.value })}
                    placeholder="Additional notes..."
                  />
                </div>

                <Button onClick={handleCreatePayment} className="w-full">
                  Record Payment
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
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
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map(payment => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      {format(new Date(payment.created_at), 'MMM dd, yyyy HH:mm')}
                    </TableCell>
                    <TableCell>{payment.customer_name || 'N/A'}</TableCell>
                    <TableCell className="capitalize">
                      {payment.payment_method.replace('_', ' ')}
                    </TableCell>
                    <TableCell>{payment.reference_number || '-'}</TableCell>
                    <TableCell className="text-right font-medium">
                      ${payment.amount.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
                {payments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No payments recorded yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Payments;
