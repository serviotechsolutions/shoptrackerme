import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Tag, Plus, Pencil, Trash2, Copy, CheckCircle, Layers } from 'lucide-react';
import { format } from 'date-fns';

interface PromoCode {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  is_active: boolean;
  valid_from: string;
  valid_until: string | null;
  usage_limit: number | null;
  times_used: number;
  tenant_id: string;
  created_at: string;
}

const PromoCodes = () => {
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<PromoCode | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form state
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [validUntil, setValidUntil] = useState('');
  const [usageLimit, setUsageLimit] = useState('');

  const { toast } = useToast();

  useEffect(() => {
    fetchUserData();
  }, []);

  useEffect(() => {
    if (tenantId) fetchPromoCodes();
  }, [tenantId]);

  const fetchUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
      if (profile) setTenantId(profile.tenant_id);
    }
  };

  const fetchPromoCodes = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    setPromoCodes(data || []);
    setLoading(false);
  };

  const resetForm = () => {
    setCode('');
    setDiscountType('percentage');
    setDiscountValue('');
    setIsActive(true);
    setValidUntil('');
    setUsageLimit('');
    setEditingPromo(null);
  };

  const openCreate = () => {
    resetForm();
    // Auto-generate a code
    setCode(generateCode());
    setDialogOpen(true);
  };

  const openEdit = (promo: PromoCode) => {
    setEditingPromo(promo);
    setCode(promo.code);
    setDiscountType(promo.discount_type);
    setDiscountValue(String(promo.discount_value));
    setIsActive(promo.is_active);
    setValidUntil(promo.valid_until ? promo.valid_until.split('T')[0] : '');
    setUsageLimit(promo.usage_limit ? String(promo.usage_limit) : '');
    setDialogOpen(true);
  };

  const generateCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 8; i++) result += chars[Math.floor(Math.random() * chars.length)];
    return result;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !discountValue) {
      toast({ title: 'Error', description: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }

    const value = parseFloat(discountValue);
    if (isNaN(value) || value <= 0) {
      toast({ title: 'Error', description: 'Discount value must be a positive number', variant: 'destructive' });
      return;
    }
    if (discountType === 'percentage' && value > 100) {
      toast({ title: 'Error', description: 'Percentage cannot exceed 100%', variant: 'destructive' });
      return;
    }

    const payload = {
      code: code.toUpperCase().trim(),
      discount_type: discountType,
      discount_value: value,
      is_active: isActive,
      valid_until: validUntil ? new Date(validUntil).toISOString() : null,
      usage_limit: usageLimit ? parseInt(usageLimit) : null,
      tenant_id: tenantId,
    };

    try {
      if (editingPromo) {
        const { error } = await supabase.from('promo_codes').update(payload).eq('id', editingPromo.id);
        if (error) throw error;
        toast({ title: 'Updated', description: `Promo code "${payload.code}" updated successfully` });
      } else {
        const { error } = await supabase.from('promo_codes').insert(payload);
        if (error) throw error;
        toast({ title: 'Created', description: `Promo code "${payload.code}" created successfully` });
      }
      setDialogOpen(false);
      resetForm();
      fetchPromoCodes();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const toggleActive = async (promo: PromoCode) => {
    const { error } = await supabase.from('promo_codes').update({ is_active: !promo.is_active }).eq('id', promo.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      fetchPromoCodes();
    }
  };

  const deletePromo = async (promo: PromoCode) => {
    const { error } = await supabase.from('promo_codes').delete().eq('id', promo.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Deleted', description: `Promo code "${promo.code}" deleted` });
      fetchPromoCodes();
    }
  };

  const copyCode = (promoCode: string, id: string) => {
    navigator.clipboard.writeText(promoCode);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', minimumFractionDigits: 0 }).format(amount);

  const isExpired = (promo: PromoCode) =>
    promo.valid_until && new Date(promo.valid_until) < new Date();

  const isLimitReached = (promo: PromoCode) =>
    promo.usage_limit !== null && promo.times_used >= promo.usage_limit;

  const getStatusBadge = (promo: PromoCode) => {
    if (!promo.is_active) return <Badge variant="secondary">Inactive</Badge>;
    if (isExpired(promo)) return <Badge variant="destructive">Expired</Badge>;
    if (isLimitReached(promo)) return <Badge variant="outline">Limit Reached</Badge>;
    return <Badge className="bg-green-600 text-white hover:bg-green-700">Active</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Promo Codes</h1>
            <p className="text-muted-foreground">Create and manage discount codes for your customers</p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> New Code
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="rounded-full bg-primary/10 p-3">
                <Tag className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Codes</p>
                <p className="text-xl font-bold">{promoCodes.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="rounded-full bg-green-500/10 p-3">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Codes</p>
                <p className="text-xl font-bold">{promoCodes.filter(p => p.is_active && !isExpired(p) && !isLimitReached(p)).length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="rounded-full bg-blue-500/10 p-3">
                <Tag className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Uses</p>
                <p className="text-xl font-bold">{promoCodes.reduce((s, p) => s + p.times_used, 0)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Promo Codes</CardTitle>
            <CardDescription>Manage your promotional discount codes</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : promoCodes.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Tag className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">No promo codes yet</p>
                <p className="text-sm mb-4">Create your first promo code to offer discounts</p>
                <Button onClick={openCreate} className="gap-2">
                  <Plus className="h-4 w-4" /> Create Promo Code
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Discount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Usage</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {promoCodes.map(promo => (
                      <TableRow key={promo.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="font-mono text-sm font-bold bg-muted px-2 py-1 rounded">{promo.code}</code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => copyCode(promo.code, promo.id)}
                            >
                              {copiedId === promo.id ? <CheckCircle className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {promo.discount_type === 'percentage'
                            ? `${promo.discount_value}%`
                            : formatCurrency(promo.discount_value)}
                        </TableCell>
                        <TableCell>{getStatusBadge(promo)}</TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {promo.times_used}{promo.usage_limit ? `/${promo.usage_limit}` : ''} uses
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {promo.valid_until
                            ? format(new Date(promo.valid_until), 'MMM dd, yyyy')
                            : <span className="text-muted-foreground">No expiry</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Switch
                              checked={promo.is_active}
                              onCheckedChange={() => toggleActive(promo)}
                              className="mr-2"
                            />
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(promo)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deletePromo(promo)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPromo ? 'Edit Promo Code' : 'Create Promo Code'}</DialogTitle>
            <DialogDescription>
              {editingPromo ? 'Update the promo code details' : 'Set up a new promotional discount code'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Code</Label>
              <div className="flex gap-2">
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. SAVE20"
                  className="font-mono uppercase"
                  required
                />
                <Button type="button" variant="outline" size="sm" onClick={() => setCode(generateCode())}>
                  Generate
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Discount Type</Label>
                <Select value={discountType} onValueChange={setDiscountType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount (UGX)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="discount_value">
                  {discountType === 'percentage' ? 'Percentage (%)' : 'Amount (UGX)'}
                </Label>
                <Input
                  id="discount_value"
                  type="number"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={discountType === 'percentage' ? '10' : '5000'}
                  min="0"
                  max={discountType === 'percentage' ? '100' : undefined}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="valid_until">Expires On (Optional)</Label>
                <Input
                  id="valid_until"
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="usage_limit">Usage Limit (Optional)</Label>
                <Input
                  id="usage_limit"
                  type="number"
                  value={usageLimit}
                  onChange={(e) => setUsageLimit(e.target.value)}
                  placeholder="Unlimited"
                  min="1"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={isActive} onCheckedChange={setIsActive} id="is_active" />
              <Label htmlFor="is_active">Active immediately</Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit">{editingPromo ? 'Update' : 'Create'} Code</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default PromoCodes;
