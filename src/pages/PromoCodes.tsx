import { useEffect, useState, useRef, useCallback } from 'react';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Tag, Plus, Pencil, Trash2, Copy, CheckCircle, Layers, Share2,
  Download, Clock, TrendingUp, Users, Image as ImageIcon, MoreVertical, ToggleLeft, ToggleRight
} from 'lucide-react';
import { format, differenceInDays, differenceInHours } from 'date-fns';

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

interface PromoRevenue {
  promo_code: string;
  total_revenue: number;
  total_transactions: number;
}

const PromoCodes = () => {
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [promoRevenues, setPromoRevenues] = useState<Map<string, PromoRevenue>>(new Map());
  const [tenantId, setTenantId] = useState('');
  const [shopName, setShopName] = useState('');
  const [shopLogo, setShopLogo] = useState('');
  const [userAvatar, setUserAvatar] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<PromoCode | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkCount, setBulkCount] = useState('5');
  const [bulkPrefix, setBulkPrefix] = useState('');
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [posterPromo, setPosterPromo] = useState<PromoCode | null>(null);
  const [posterImage, setPosterImage] = useState<string>('');
  const [shareMenuPromo, setShareMenuPromo] = useState<PromoCode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Form state
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [validUntil, setValidUntil] = useState('');
  const [usageLimit, setUsageLimit] = useState('');

  // Bulk form
  const [bulkDiscountType, setBulkDiscountType] = useState('percentage');
  const [bulkDiscountValue, setBulkDiscountValue] = useState('');
  const [bulkIsActive, setBulkIsActive] = useState(true);
  const [bulkValidUntil, setBulkValidUntil] = useState('');
  const [bulkUsageLimit, setBulkUsageLimit] = useState('');

  const { toast } = useToast();

  useEffect(() => {
    fetchUserData();
  }, []);

  useEffect(() => {
    if (tenantId) {
      fetchPromoCodes();
      fetchPromoRevenues();
    }
  }, [tenantId]);

  const fetchUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('tenant_id, avatar_url').eq('id', user.id).single();
      if (profile) {
        setTenantId(profile.tenant_id);
        setUserAvatar(profile.avatar_url || '');
        const { data: tenant } = await supabase.from('tenants').select('name, logo_url').eq('id', profile.tenant_id).single();
        if (tenant) {
          setShopName(tenant.name);
          setShopLogo(tenant.logo_url || '');
        }
      }
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

  const fetchPromoRevenues = async () => {
    const { data } = await supabase
      .from('transactions')
      .select('promo_code, total_amount')
      .eq('tenant_id', tenantId)
      .not('promo_code', 'is', null);

    if (data) {
      const revenueMap = new Map<string, PromoRevenue>();
      data.forEach(tx => {
        if (!tx.promo_code) return;
        const existing = revenueMap.get(tx.promo_code) || { promo_code: tx.promo_code, total_revenue: 0, total_transactions: 0 };
        existing.total_revenue += Number(tx.total_amount);
        existing.total_transactions += 1;
        revenueMap.set(tx.promo_code, existing);
      });
      setPromoRevenues(revenueMap);
    }
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
    if (!error) fetchPromoCodes();
    else toast({ title: 'Error', description: error.message, variant: 'destructive' });
  };

  const deletePromo = async (promo: PromoCode) => {
    const { error } = await supabase.from('promo_codes').delete().eq('id', promo.id);
    if (!error) {
      toast({ title: 'Deleted', description: `Promo code "${promo.code}" deleted` });
      fetchPromoCodes();
    } else toast({ title: 'Error', description: error.message, variant: 'destructive' });
  };

  const copyCode = (promoCode: string, id: string) => {
    navigator.clipboard.writeText(promoCode);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleBulkGenerate = async () => {
    const count = parseInt(bulkCount);
    if (isNaN(count) || count < 1 || count > 100) {
      toast({ title: 'Error', description: 'Enter a number between 1 and 100', variant: 'destructive' });
      return;
    }
    const value = parseFloat(bulkDiscountValue);
    if (isNaN(value) || value <= 0) {
      toast({ title: 'Error', description: 'Discount value must be a positive number', variant: 'destructive' });
      return;
    }
    if (bulkDiscountType === 'percentage' && value > 100) {
      toast({ title: 'Error', description: 'Percentage cannot exceed 100%', variant: 'destructive' });
      return;
    }

    setBulkGenerating(true);
    const prefix = bulkPrefix.toUpperCase().trim();
    const codes = Array.from({ length: count }, () => ({
      code: prefix ? `${prefix}-${generateCode()}` : generateCode(),
      discount_type: bulkDiscountType,
      discount_value: value,
      is_active: bulkIsActive,
      valid_until: bulkValidUntil ? new Date(bulkValidUntil).toISOString() : null,
      usage_limit: bulkUsageLimit ? parseInt(bulkUsageLimit) : null,
      tenant_id: tenantId,
    }));

    const { error } = await supabase.from('promo_codes').insert(codes);
    setBulkGenerating(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Bulk Created', description: `${count} promo codes generated successfully` });
      setBulkDialogOpen(false);
      setBulkCount('5');
      setBulkPrefix('');
      setBulkDiscountType('percentage');
      setBulkDiscountValue('');
      setBulkIsActive(true);
      setBulkValidUntil('');
      setBulkUsageLimit('');
      fetchPromoCodes();
    }
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

  const getDiscountText = (promo: PromoCode) =>
    promo.discount_type === 'percentage'
      ? `${promo.discount_value}% OFF`
      : `${formatCurrency(promo.discount_value)} OFF`;

  const getExpiryCountdown = (promo: PromoCode) => {
    if (!promo.valid_until) return null;
    const expiry = new Date(promo.valid_until);
    const now = new Date();
    if (expiry < now) return 'Expired';
    const days = differenceInDays(expiry, now);
    if (days > 0) return `${days}d left`;
    const hours = differenceInHours(expiry, now);
    return `${hours}h left`;
  };

  // === Share functionality ===
  const buildShareMessage = (promo: PromoCode) => {
    const discount = getDiscountText(promo);
    const expiryLine = promo.valid_until
      ? `\n\nOffer valid until: ${format(new Date(promo.valid_until), 'MMM dd, yyyy')}`
      : '';
    return `🎉 Special Offer from ${shopName || 'our shop'}!\n\nUse promo code: ${promo.code}\nGet ${discount} your purchase.\n\nShow this code to the cashier when paying.${expiryLine}`;
  };

  const handleShare = async (promo: PromoCode) => {
    const message = buildShareMessage(promo);

    // Try native Web Share API first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${shopName || 'Shop'} - Promo Code: ${promo.code}`,
          text: message,
        });
        return;
      } catch (err: any) {
        // User cancelled or API failed - fall through to manual options
        if (err.name === 'AbortError') return;
      }
    }

    // Fallback: show share menu dialog
    setShareMenuPromo(promo);
  };

  const shareViaWhatsApp = (promo: PromoCode) => {
    const message = encodeURIComponent(buildShareMessage(promo));
    window.open(`https://wa.me/?text=${message}`, '_blank');
    setShareMenuPromo(null);
  };

  const shareViaSMS = (promo: PromoCode) => {
    const message = encodeURIComponent(buildShareMessage(promo));
    window.open(`sms:?body=${message}`, '_blank');
    setShareMenuPromo(null);
  };

  const shareViaEmail = (promo: PromoCode) => {
    const subject = encodeURIComponent(`Special Offer - Use code ${promo.code}`);
    const body = encodeURIComponent(buildShareMessage(promo));
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
    setShareMenuPromo(null);
  };

  const shareViaFacebook = (promo: PromoCode) => {
    const text = encodeURIComponent(buildShareMessage(promo));
    window.open(`https://www.facebook.com/sharer/sharer.php?quote=${text}`, '_blank');
    setShareMenuPromo(null);
  };

  const copyShareMessage = (promo: PromoCode) => {
    navigator.clipboard.writeText(buildShareMessage(promo));
    toast({ title: 'Copied', description: 'Share message copied to clipboard' });
    setShareMenuPromo(null);
  };

  // === Poster generator ===
  const generatePoster = useCallback((promo: PromoCode) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      // Background gradient
      const gradient = ctx.createLinearGradient(0, 0, 1080, 1350);
      gradient.addColorStop(0, '#0f0c29');
      gradient.addColorStop(0.5, '#302b63');
      gradient.addColorStop(1, '#24243e');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1080, 1350);

      // Decorative elements
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#e94560';
      ctx.beginPath(); ctx.arc(950, 100, 250, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(130, 1200, 300, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3498db';
      ctx.beginPath(); ctx.arc(100, 400, 150, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;

      // Top bar with app branding
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(0, 0, 1080, 80);
      ctx.font = 'bold 24px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.textAlign = 'center';
      ctx.fillText('Powered by Servio Tech Solutions', 540, 52);

      // Shop logo
      let logoY = 110;
      if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
        const logoSize = 120;
        const logoX = (1080 - logoSize) / 2;
        // Draw circular logo
        ctx.save();
        ctx.beginPath();
        ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
        ctx.restore();
        // Logo border
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
        ctx.stroke();
        logoY += logoSize + 20;
      } else {
        logoY += 20;
      }

      // Shop name
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 52px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(shopName || 'Our Shop', 540, logoY + 40);

      // Divider line
      const divY = logoY + 70;
      ctx.strokeStyle = 'rgba(233,69,96,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(340, divY); ctx.lineTo(740, divY); ctx.stroke();

      // "SPECIAL OFFER" text
      ctx.font = 'bold 38px sans-serif';
      ctx.fillStyle = '#e94560';
      ctx.fillText('✨ SPECIAL OFFER ✨', 540, divY + 60);

      // Discount value - big
      const discountDisplay = promo.discount_type === 'percentage'
        ? `${promo.discount_value}%`
        : formatCurrency(promo.discount_value);
      ctx.font = 'bold 150px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(discountDisplay, 540, divY + 220);

      // "OFF" text
      ctx.font = 'bold 80px sans-serif';
      ctx.fillStyle = '#e94560';
      ctx.fillText('OFF', 540, divY + 300);

      // Promo code box
      const codeBoxY = divY + 350;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      const boxW = 650;
      const boxH = 110;
      const boxX = (1080 - boxW) / 2;
      ctx.beginPath(); ctx.roundRect(boxX, codeBoxY, boxW, boxH, 20); ctx.fill();
      ctx.strokeStyle = '#e94560';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Dashed border effect
      ctx.setLineDash([10, 6]);
      ctx.strokeStyle = 'rgba(233,69,96,0.4)';
      ctx.beginPath(); ctx.roundRect(boxX - 8, codeBoxY - 8, boxW + 16, boxH + 16, 24); ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = 'bold 26px sans-serif';
      ctx.fillStyle = '#aaaaaa';
      ctx.fillText('USE CODE', 540, codeBoxY - 15);

      ctx.font = 'bold 60px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(promo.code, 540, codeBoxY + 72);

      // Instructions
      const infoY = codeBoxY + boxH + 50;
      ctx.font = '30px sans-serif';
      ctx.fillStyle = '#cccccc';
      ctx.fillText('📱 Show this code to the cashier when paying', 540, infoY);

      // Usage & Expiry info section
      const detailsY = infoY + 60;
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath(); ctx.roundRect(140, detailsY, 800, 140, 16); ctx.fill();

      ctx.font = 'bold 26px sans-serif';
      ctx.fillStyle = '#e94560';
      ctx.textAlign = 'center';

      if (promo.valid_until) {
        ctx.fillText(`⏰ Valid until: ${format(new Date(promo.valid_until), 'MMMM dd, yyyy')}`, 540, detailsY + 45);
      } else {
        ctx.fillText('⏰ No expiry — use anytime!', 540, detailsY + 45);
      }

      if (promo.usage_limit) {
        const remaining = promo.usage_limit - promo.times_used;
        ctx.font = '24px sans-serif';
        ctx.fillStyle = '#ffcc00';
        ctx.fillText(`🔥 Limited offer — only ${remaining} uses remaining!`, 540, detailsY + 90);
      } else {
        ctx.font = '24px sans-serif';
        ctx.fillStyle = '#88cc88';
        ctx.fillText('♾️ Unlimited uses — share with everyone!', 540, detailsY + 90);
      }

      // How to use section
      const howY = detailsY + 170;
      ctx.font = 'bold 28px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('HOW TO USE', 540, howY);

      ctx.font = '22px sans-serif';
      ctx.fillStyle = '#bbbbbb';
      const steps = [
        '1. Visit our shop or order online',
        '2. Tell the cashier your promo code',
        '3. Enjoy your discount! 🎉'
      ];
      steps.forEach((step, i) => {
        ctx.fillText(step, 540, howY + 40 + i * 36);
      });

      // Footer
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(0, 1250, 1080, 100);
      ctx.font = '20px sans-serif';
      ctx.fillStyle = '#666666';
      ctx.fillText('Terms & conditions apply • Powered by Servio Tech Solutions', 540, 1300);

      setPosterImage(canvas.toDataURL('image/png'));
      setPosterPromo(promo);
    };

    // Load logo image if available
    let logoImg: HTMLImageElement | null = null;
    if (shopLogo) {
      logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      logoImg.onload = () => draw();
      logoImg.onerror = () => draw();
      logoImg.src = shopLogo;
    } else {
      draw();
    }
  }, [shopName, shopLogo]);

  const downloadPoster = () => {
    const canvas = canvasRef.current;
    if (!canvas || !posterPromo) return;
    const link = document.createElement('a');
    link.download = `promo-${posterPromo.code}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const sharePoster = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !posterPromo) return;

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `promo-${posterPromo.code}.png`, { type: 'image/png' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            title: `Promo Code: ${posterPromo.code}`,
            text: buildShareMessage(posterPromo),
            files: [file],
          });
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            // Fallback: just download
            downloadPoster();
          }
        }
      } else {
        downloadPoster();
        toast({ title: 'Downloaded', description: 'Poster saved. You can share it manually.' });
      }
    }, 'image/png');
  };

  // Stats
  const totalRevenue = Array.from(promoRevenues.values()).reduce((s, r) => s + r.total_revenue, 0);
  const activeCodes = promoCodes.filter(p => p.is_active && !isExpired(p) && !isLimitReached(p)).length;
  const totalUses = promoCodes.reduce((s, p) => s + p.times_used, 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Promo Codes</h1>
            <p className="text-muted-foreground text-sm">Create, manage and share discount codes</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setBulkDialogOpen(true)} size="sm" className="gap-1.5">
              <Layers className="h-4 w-4" /> Bulk
            </Button>
            <Button onClick={openCreate} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> New Code
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-full bg-primary/10 p-2.5">
                <Tag className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Codes</p>
                <p className="text-lg font-bold">{promoCodes.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-full bg-green-500/10 p-2.5">
                <CheckCircle className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active</p>
                <p className="text-lg font-bold">{activeCodes}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-full bg-blue-500/10 p-2.5">
                <Users className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Uses</p>
                <p className="text-lg font-bold">{totalUses}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-full bg-amber-500/10 p-2.5">
                <TrendingUp className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Revenue</p>
                <p className="text-lg font-bold truncate">{formatCurrency(totalRevenue)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Promo codes list — mobile cards + desktop table */}
        <Card>
          <CardHeader>
            <CardTitle>All Promo Codes</CardTitle>
            <CardDescription>Manage and share your promotional discount codes</CardDescription>
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
              <>
                {/* Mobile card view */}
                <div className="space-y-3 md:hidden">
                  {promoCodes.map(promo => {
                    const revenue = promoRevenues.get(promo.code);
                    const countdown = getExpiryCountdown(promo);
                    return (
                      <div key={promo.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <code className="font-mono text-sm font-bold bg-muted px-2 py-1 rounded">{promo.code}</code>
                            {getStatusBadge(promo)}
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => copyCode(promo.code, promo.id)}>
                                <Copy className="h-4 w-4 mr-2" /> Copy Code
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleShare(promo)}>
                                <Share2 className="h-4 w-4 mr-2" /> Share
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => generatePoster(promo)}>
                                <ImageIcon className="h-4 w-4 mr-2" /> Generate Poster
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => toggleActive(promo)}>
                                {promo.is_active ? <ToggleLeft className="h-4 w-4 mr-2" /> : <ToggleRight className="h-4 w-4 mr-2" />}
                                {promo.is_active ? 'Deactivate' : 'Activate'}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEdit(promo)}>
                                <Pencil className="h-4 w-4 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deletePromo(promo)}>
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">Discount</p>
                            <p className="font-semibold">{getDiscountText(promo)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Uses</p>
                            <p className="font-semibold">{promo.times_used}{promo.usage_limit ? `/${promo.usage_limit}` : ''}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Revenue</p>
                            <p className="font-semibold truncate">{revenue ? formatCurrency(revenue.total_revenue) : '—'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          {countdown && (
                            <span className={`flex items-center gap-1 ${countdown === 'Expired' ? 'text-destructive' : 'text-amber-600'}`}>
                              <Clock className="h-3 w-3" /> {countdown}
                            </span>
                          )}
                          {!promo.valid_until && <span>No expiry</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Discount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Usage</TableHead>
                        <TableHead>Revenue</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {promoCodes.map(promo => {
                        const revenue = promoRevenues.get(promo.code);
                        const countdown = getExpiryCountdown(promo);
                        return (
                          <TableRow key={promo.id}>
                            <TableCell>
                              <code className="font-mono text-sm font-bold bg-muted px-2 py-1 rounded">{promo.code}</code>
                            </TableCell>
                            <TableCell className="font-medium">{getDiscountText(promo)}</TableCell>
                            <TableCell>{getStatusBadge(promo)}</TableCell>
                            <TableCell>
                              <span className="text-sm">{promo.times_used}{promo.usage_limit ? `/${promo.usage_limit}` : ''} uses</span>
                              {promo.usage_limit && (
                                <div className="w-16 h-1.5 bg-muted rounded-full mt-1">
                                  <div
                                    className="h-full bg-primary rounded-full"
                                    style={{ width: `${Math.min(100, (promo.times_used / promo.usage_limit) * 100)}%` }}
                                  />
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-sm font-medium">
                              {revenue ? formatCurrency(revenue.total_revenue) : '—'}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {promo.valid_until ? (
                                  <div>
                                    <div>{format(new Date(promo.valid_until), 'MMM dd, yyyy')}</div>
                                    {countdown && (
                                      <span className={`text-xs ${countdown === 'Expired' ? 'text-destructive' : 'text-amber-600'}`}>
                                        {countdown}
                                      </span>
                                    )}
                                  </div>
                                ) : <span className="text-muted-foreground">No expiry</span>}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => copyCode(promo.code, promo.id)}>
                                    <Copy className="h-4 w-4 mr-2" /> Copy Code
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleShare(promo)}>
                                    <Share2 className="h-4 w-4 mr-2" /> Share
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => generatePoster(promo)}>
                                    <ImageIcon className="h-4 w-4 mr-2" /> Generate Poster
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => toggleActive(promo)}>
                                    {promo.is_active ? <ToggleLeft className="h-4 w-4 mr-2" /> : <ToggleRight className="h-4 w-4 mr-2" />}
                                    {promo.is_active ? 'Deactivate' : 'Activate'}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => openEdit(promo)}>
                                    <Pencil className="h-4 w-4 mr-2" /> Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deletePromo(promo)}>
                                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Hidden canvas for poster generation */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Share Menu Fallback Dialog (desktop) */}
      <Dialog open={!!shareMenuPromo} onOpenChange={(open) => !open && setShareMenuPromo(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Share Promo Code</DialogTitle>
            <DialogDescription>Choose how to share "{shareMenuPromo?.code}"</DialogDescription>
          </DialogHeader>
          {shareMenuPromo && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="gap-2 justify-start" onClick={() => shareViaWhatsApp(shareMenuPromo)}>
                <span className="text-green-600">💬</span> WhatsApp
              </Button>
              <Button variant="outline" className="gap-2 justify-start" onClick={() => shareViaFacebook(shareMenuPromo)}>
                <span className="text-blue-600">📘</span> Facebook
              </Button>
              <Button variant="outline" className="gap-2 justify-start" onClick={() => shareViaSMS(shareMenuPromo)}>
                <span>📱</span> SMS
              </Button>
              <Button variant="outline" className="gap-2 justify-start" onClick={() => shareViaEmail(shareMenuPromo)}>
                <span>📧</span> Email
              </Button>
              <Button variant="outline" className="gap-2 justify-start col-span-2" onClick={() => copyShareMessage(shareMenuPromo)}>
                <Copy className="h-4 w-4" /> Copy Message
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Poster Preview Dialog */}
      <Dialog open={!!posterPromo} onOpenChange={(open) => { if (!open) { setPosterPromo(null); setPosterImage(''); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Promo Poster</DialogTitle>
            <DialogDescription>Download or share the poster for &quot;{posterPromo?.code}&quot;</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center">
            {posterImage && (
              <img src={posterImage} alt="Promo poster" className="max-w-full rounded-lg border" style={{ maxHeight: 400, width: 'auto' }} />
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={downloadPoster} className="gap-2">
              <Download className="h-4 w-4" /> Download
            </Button>
            <Button onClick={sharePoster} className="gap-2">
              <Share2 className="h-4 w-4" /> Share Poster
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <Input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. SAVE20" className="font-mono uppercase" required />
                <Button type="button" variant="outline" size="sm" onClick={() => setCode(generateCode())}>Generate</Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Discount Type</Label>
                <Select value={discountType} onValueChange={setDiscountType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount (UGX)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="discount_value">{discountType === 'percentage' ? 'Percentage (%)' : 'Amount (UGX)'}</Label>
                <Input id="discount_value" type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder={discountType === 'percentage' ? '10' : '5000'} min="0" max={discountType === 'percentage' ? '100' : undefined} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="valid_until">Expires On (Optional)</Label>
                <Input id="valid_until" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="usage_limit">Usage Limit (Optional)</Label>
                <Input id="usage_limit" type="number" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} placeholder="Unlimited" min="1" />
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

      {/* Bulk Generate Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Generate Promo Codes</DialogTitle>
            <DialogDescription>Create multiple codes at once with the same discount settings</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="bulk_count">Number of Codes</Label>
                <Input id="bulk_count" type="number" value={bulkCount} onChange={(e) => setBulkCount(e.target.value)} min="1" max="100" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bulk_prefix">Prefix (Optional)</Label>
                <Input id="bulk_prefix" value={bulkPrefix} onChange={(e) => setBulkPrefix(e.target.value.toUpperCase())} placeholder="e.g. SALE" className="font-mono uppercase" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Discount Type</Label>
                <Select value={bulkDiscountType} onValueChange={setBulkDiscountType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed Amount (UGX)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bulk_discount_value">{bulkDiscountType === 'percentage' ? 'Percentage (%)' : 'Amount (UGX)'}</Label>
                <Input id="bulk_discount_value" type="number" value={bulkDiscountValue} onChange={(e) => setBulkDiscountValue(e.target.value)} placeholder={bulkDiscountType === 'percentage' ? '10' : '5000'} min="0" max={bulkDiscountType === 'percentage' ? '100' : undefined} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="bulk_valid_until">Expires On (Optional)</Label>
                <Input id="bulk_valid_until" type="date" value={bulkValidUntil} onChange={(e) => setBulkValidUntil(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bulk_usage_limit">Usage Limit (Optional)</Label>
                <Input id="bulk_usage_limit" type="number" value={bulkUsageLimit} onChange={(e) => setBulkUsageLimit(e.target.value)} placeholder="Unlimited" min="1" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={bulkIsActive} onCheckedChange={setBulkIsActive} id="bulk_is_active" />
              <Label htmlFor="bulk_is_active">Active immediately</Label>
            </div>
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              {bulkPrefix ? `Codes will look like: ${bulkPrefix}-${generateCode()}` : `Codes will look like: ${generateCode()}`}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleBulkGenerate} disabled={bulkGenerating} className="gap-2">
                <Layers className="h-4 w-4" />
                {bulkGenerating ? 'Generating...' : `Generate ${bulkCount || 0} Codes`}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default PromoCodes;
