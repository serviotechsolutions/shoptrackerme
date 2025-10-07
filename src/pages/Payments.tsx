import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { CreditCard, Plus, DollarSign, Calendar } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

interface Subscription {
  id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  plan_name: string;
  amount: number;
  billing_cycle: string;
  status: string;
  start_date: string;
  next_billing_date: string;
  end_date: string | null;
}

const Payments = () => {
  const { toast } = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [subscriptionDialogOpen, setSubscriptionDialogOpen] = useState(false);

  const [newPayment, setNewPayment] = useState({
    amount: '',
    payment_method: 'cash',
    customer_name: '',
    customer_phone: '',
    reference_number: '',
    notes: '',
  });

  const [newSubscription, setNewSubscription] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    plan_name: '',
    amount: '',
    billing_cycle: 'monthly',
    start_date: format(new Date(), 'yyyy-MM-dd'),
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .single();

      if (profile) {
        const [paymentsResult, subscriptionsResult] = await Promise.all([
          supabase
            .from('payments')
            .select('*')
            .eq('tenant_id', profile.tenant_id)
            .order('created_at', { ascending: false }),
          supabase
            .from('subscriptions')
            .select('*')
            .eq('tenant_id', profile.tenant_id)
            .order('created_at', { ascending: false }),
        ]);

        if (paymentsResult.data) setPayments(paymentsResult.data);
        if (subscriptionsResult.data) setSubscriptions(subscriptionsResult.data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load data',
        variant: 'destructive',
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
          variant: 'destructive',
        });
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .single();

      if (!profile) throw new Error('Could not fetch profile');

      const { error } = await supabase.from('payments').insert({
        tenant_id: profile.tenant_id,
        amount: parseFloat(newPayment.amount),
        payment_method: newPayment.payment_method,
        payment_status: 'completed',
        customer_name: newPayment.customer_name || null,
        customer_phone: newPayment.customer_phone || null,
        reference_number: newPayment.reference_number || null,
        notes: newPayment.notes || null,
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Payment recorded successfully',
      });

      setPaymentDialogOpen(false);
      setNewPayment({
        amount: '',
        payment_method: 'cash',
        customer_name: '',
        customer_phone: '',
        reference_number: '',
        notes: '',
      });
      fetchData();
    } catch (error) {
      console.error('Error creating payment:', error);
      toast({
        title: 'Error',
        description: 'Failed to record payment',
        variant: 'destructive',
      });
    }
  };

  const handleCreateSubscription = async () => {
    try {
      if (!newSubscription.customer_name || !newSubscription.plan_name || !newSubscription.amount) {
        toast({
          title: 'Validation Error',
          description: 'Please fill in all required fields',
          variant: 'destructive',
        });
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .single();

      if (!profile) throw new Error('Could not fetch profile');

      const startDate = new Date(newSubscription.start_date);
      let nextBillingDate = new Date(startDate);

      switch (newSubscription.billing_cycle) {
        case 'daily':
          nextBillingDate.setDate(nextBillingDate.getDate() + 1);
          break;
        case 'weekly':
          nextBillingDate.setDate(nextBillingDate.getDate() + 7);
          break;
        case 'monthly':
          nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
          break;
        case 'yearly':
          nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
          break;
      }

      const { error } = await supabase.from('subscriptions').insert({
        tenant_id: profile.tenant_id,
        customer_name: newSubscription.customer_name,
        customer_email: newSubscription.customer_email || null,
        customer_phone: newSubscription.customer_phone || null,
        plan_name: newSubscription.plan_name,
        amount: parseFloat(newSubscription.amount),
        billing_cycle: newSubscription.billing_cycle,
        status: 'active',
        start_date: newSubscription.start_date,
        next_billing_date: format(nextBillingDate, 'yyyy-MM-dd'),
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Subscription created successfully',
      });

      setSubscriptionDialogOpen(false);
      setNewSubscription({
        customer_name: '',
        customer_email: '',
        customer_phone: '',
        plan_name: '',
        amount: '',
        billing_cycle: 'monthly',
        start_date: format(new Date(), 'yyyy-MM-dd'),
      });
      fetchData();
    } catch (error) {
      console.error('Error creating subscription:', error);
      toast({
        title: 'Error',
        description: 'Failed to create subscription',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateSubscriptionStatus = async (id: string, status: string) => {
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({ status })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Subscription status updated',
      });

      fetchData();
    } catch (error) {
      console.error('Error updating subscription:', error);
      toast({
        title: 'Error',
        description: 'Failed to update subscription',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      active: 'default',
      paused: 'secondary',
      cancelled: 'destructive',
      expired: 'destructive',
    };
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
  };

  const getTotalRevenue = () => {
    return payments.reduce((sum, payment) => sum + payment.amount, 0);
  };

  const getActiveSubscriptionsRevenue = () => {
    return subscriptions
      .filter((sub) => sub.status === 'active')
      .reduce((sum, sub) => sum + sub.amount, 0);
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
            <h1 className="text-3xl font-bold tracking-tight">Payments & Subscriptions</h1>
            <p className="text-muted-foreground">Track payments and manage recurring subscriptions</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Payments</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${getTotalRevenue().toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">{payments.length} transactions</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {subscriptions.filter((s) => s.status === 'active').length}
              </div>
              <p className="text-xs text-muted-foreground">
                ${getActiveSubscriptionsRevenue().toFixed(2)}/period
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Subscriptions</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{subscriptions.length}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="payments">
          <TabsList>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          </TabsList>

          <TabsContent value="payments" className="space-y-4">
            <div className="flex justify-end">
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
                        onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                        placeholder="0.00"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="payment_method">Payment Method</Label>
                      <Select
                        value={newPayment.payment_method}
                        onValueChange={(value) =>
                          setNewPayment({ ...newPayment, payment_method: value })
                        }
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
                        onChange={(e) =>
                          setNewPayment({ ...newPayment, customer_name: e.target.value })
                        }
                        placeholder="John Doe"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="customer_phone">Customer Phone</Label>
                      <Input
                        id="customer_phone"
                        value={newPayment.customer_phone}
                        onChange={(e) =>
                          setNewPayment({ ...newPayment, customer_phone: e.target.value })
                        }
                        placeholder="+1234567890"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="reference_number">Reference Number</Label>
                      <Input
                        id="reference_number"
                        value={newPayment.reference_number}
                        onChange={(e) =>
                          setNewPayment({ ...newPayment, reference_number: e.target.value })
                        }
                        placeholder="REF-12345"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea
                        id="notes"
                        value={newPayment.notes}
                        onChange={(e) => setNewPayment({ ...newPayment, notes: e.target.value })}
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
                    {payments.map((payment) => (
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
          </TabsContent>

          <TabsContent value="subscriptions" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={subscriptionDialogOpen} onOpenChange={setSubscriptionDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    New Subscription
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Subscription</DialogTitle>
                    <DialogDescription>Set up a new recurring subscription</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="sub_customer_name">Customer Name *</Label>
                      <Input
                        id="sub_customer_name"
                        value={newSubscription.customer_name}
                        onChange={(e) =>
                          setNewSubscription({ ...newSubscription, customer_name: e.target.value })
                        }
                        placeholder="John Doe"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sub_customer_email">Customer Email</Label>
                      <Input
                        id="sub_customer_email"
                        type="email"
                        value={newSubscription.customer_email}
                        onChange={(e) =>
                          setNewSubscription({ ...newSubscription, customer_email: e.target.value })
                        }
                        placeholder="john@example.com"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sub_customer_phone">Customer Phone</Label>
                      <Input
                        id="sub_customer_phone"
                        value={newSubscription.customer_phone}
                        onChange={(e) =>
                          setNewSubscription({ ...newSubscription, customer_phone: e.target.value })
                        }
                        placeholder="+1234567890"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="plan_name">Plan Name *</Label>
                      <Input
                        id="plan_name"
                        value={newSubscription.plan_name}
                        onChange={(e) =>
                          setNewSubscription({ ...newSubscription, plan_name: e.target.value })
                        }
                        placeholder="Premium Plan"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="sub_amount">Amount *</Label>
                      <Input
                        id="sub_amount"
                        type="number"
                        step="0.01"
                        value={newSubscription.amount}
                        onChange={(e) =>
                          setNewSubscription({ ...newSubscription, amount: e.target.value })
                        }
                        placeholder="0.00"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="billing_cycle">Billing Cycle</Label>
                      <Select
                        value={newSubscription.billing_cycle}
                        onValueChange={(value) =>
                          setNewSubscription({ ...newSubscription, billing_cycle: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="yearly">Yearly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="start_date">Start Date</Label>
                      <Input
                        id="start_date"
                        type="date"
                        value={newSubscription.start_date}
                        onChange={(e) =>
                          setNewSubscription({ ...newSubscription, start_date: e.target.value })
                        }
                      />
                    </div>

                    <Button onClick={handleCreateSubscription} className="w-full">
                      Create Subscription
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Active Subscriptions</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Cycle</TableHead>
                      <TableHead>Next Billing</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subscriptions.map((subscription) => (
                      <TableRow key={subscription.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{subscription.customer_name}</div>
                            {subscription.customer_email && (
                              <div className="text-xs text-muted-foreground">
                                {subscription.customer_email}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{subscription.plan_name}</TableCell>
                        <TableCell>${subscription.amount.toFixed(2)}</TableCell>
                        <TableCell className="capitalize">{subscription.billing_cycle}</TableCell>
                        <TableCell>
                          {format(new Date(subscription.next_billing_date), 'MMM dd, yyyy')}
                        </TableCell>
                        <TableCell>{getStatusBadge(subscription.status)}</TableCell>
                        <TableCell>
                          {subscription.status === 'active' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleUpdateSubscriptionStatus(subscription.id, 'paused')
                              }
                            >
                              Pause
                            </Button>
                          )}
                          {subscription.status === 'paused' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleUpdateSubscriptionStatus(subscription.id, 'active')
                              }
                            >
                              Resume
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {subscriptions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No subscriptions yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Payments;
