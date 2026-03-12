import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sparkles, Zap, Cake, TrendingUp, Plus, Play, Pause, Trash2,
  Clock, Gift, BarChart3, Target, Loader2, CheckCircle, AlertTriangle,
  Share2, Copy, RefreshCw
} from "lucide-react";
import { format, formatDistanceToNow, differenceInSeconds } from "date-fns";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";

interface Promotion {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  discount_type: string;
  discount_value: number;
  promo_code: string | null;
  start_time: string;
  end_time: string | null;
  target_products: any;
  target_customers: any;
  max_redemptions: number | null;
  current_redemptions: number;
  ai_reasoning: string | null;
  trigger_type: string | null;
  metadata: any;
  created_at: string;
}

interface Redemption {
  id: string;
  promotion_id: string;
  discount_amount: number;
  redeemed_at: string;
}

interface AISuggestion {
  name: string;
  description: string;
  type: string;
  discount_type: string;
  discount_value: number;
  duration_hours: number;
  target_products: string[];
  reasoning: string;
  expected_impact: string;
}

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--secondary))",
  "hsl(var(--success))",
  "hsl(var(--destructive))",
  "#8b5cf6",
];

const Promotions = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  // Create promotion dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formType, setFormType] = useState("manual");
  const [formDiscountType, setFormDiscountType] = useState("percentage");
  const [formDiscountValue, setFormDiscountValue] = useState("");
  const [formPromoCode, setFormPromoCode] = useState("");
  const [formStartTime, setFormStartTime] = useState("");
  const [formEndTime, setFormEndTime] = useState("");
  const [formMaxRedemptions, setFormMaxRedemptions] = useState("");
  const [saving, setSaving] = useState(false);

  // AI suggestions
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  // Countdown timers
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (user) fetchTenantAndData();
  }, [user]);

  const fetchTenantAndData = async () => {
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles").select("tenant_id").eq("id", user.id).single();
    if (profile) {
      setTenantId(profile.tenant_id);
      await Promise.all([
        fetchPromotions(profile.tenant_id),
        fetchRedemptions(profile.tenant_id),
      ]);
    }
    setLoading(false);
  };

  const fetchPromotions = async (tid: string) => {
    const { data } = await supabase
      .from("promotions").select("*").eq("tenant_id", tid).order("created_at", { ascending: false });
    setPromotions((data as any[]) || []);
  };

  const fetchRedemptions = async (tid: string) => {
    const { data } = await supabase
      .from("promotion_redemptions").select("*").eq("tenant_id", tid);
    setRedemptions((data as any[]) || []);
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", minimumFractionDigits: 0 }).format(amount);

  // Create promotion
  const handleCreate = async () => {
    if (!tenantId || !formName || !formDiscountValue) {
      toast({ title: "Error", description: "Fill in all required fields", variant: "destructive" });
      return;
    }
    setSaving(true);
    const code = formPromoCode.toUpperCase() || `PROMO${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const { error } = await supabase.from("promotions").insert({
      tenant_id: tenantId,
      name: formName,
      description: formDesc || null,
      type: formType as any,
      status: formStartTime && new Date(formStartTime) > new Date() ? "draft" : "active",
      discount_type: formDiscountType,
      discount_value: parseFloat(formDiscountValue),
      promo_code: code,
      start_time: formStartTime || new Date().toISOString(),
      end_time: formEndTime || null,
      max_redemptions: formMaxRedemptions ? parseInt(formMaxRedemptions) : null,
      created_by: user?.id,
    } as any);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Created", description: "Promotion created successfully" });
      setCreateOpen(false);
      resetForm();
      fetchPromotions(tenantId);
    }
    setSaving(false);
  };

  const resetForm = () => {
    setFormName(""); setFormDesc(""); setFormType("manual"); setFormDiscountType("percentage");
    setFormDiscountValue(""); setFormPromoCode(""); setFormStartTime(""); setFormEndTime("");
    setFormMaxRedemptions("");
  };

  const toggleStatus = async (promo: Promotion) => {
    const newStatus = promo.status === "active" ? "paused" : "active";
    await supabase.from("promotions").update({ status: newStatus } as any).eq("id", promo.id);
    toast({ title: "Updated", description: `Promotion ${newStatus}` });
    if (tenantId) fetchPromotions(tenantId);
  };

  const deletePromotion = async (id: string) => {
    await supabase.from("promotions").delete().eq("id", id);
    toast({ title: "Deleted", description: "Promotion deleted" });
    if (tenantId) fetchPromotions(tenantId);
  };

  // AI Suggestions
  const fetchAISuggestions = async () => {
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-promo-suggestions");
      if (error) throw error;
      setAiSuggestions(data.suggestions || []);
      toast({ title: "AI Analysis Complete", description: `${data.suggestions?.length || 0} suggestions generated` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setAiLoading(false);
  };

  const launchAISuggestion = async (suggestion: AISuggestion) => {
    if (!tenantId) return;
    const code = `AI${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const endTime = new Date();
    endTime.setHours(endTime.getHours() + suggestion.duration_hours);

    await supabase.from("promotions").insert({
      tenant_id: tenantId,
      name: suggestion.name,
      description: suggestion.description,
      type: "ai_suggested" as any,
      status: "active" as any,
      discount_type: suggestion.discount_type,
      discount_value: suggestion.discount_value,
      promo_code: code,
      start_time: new Date().toISOString(),
      end_time: endTime.toISOString(),
      ai_reasoning: suggestion.reasoning,
      created_by: user?.id,
    } as any);

    toast({ title: "Launched!", description: `"${suggestion.name}" is now active with code ${code}` });
    fetchPromotions(tenantId);
    setAiSuggestions(prev => prev.filter(s => s.name !== suggestion.name));
  };

  // Flash sale quick create
  const createFlashSale = () => {
    setFormType("flash_sale");
    const now = new Date();
    setFormStartTime(format(now, "yyyy-MM-dd'T'HH:mm"));
    const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    setFormEndTime(format(end, "yyyy-MM-dd'T'HH:mm"));
    setFormName("⚡ Flash Sale");
    setCreateOpen(true);
  };

  // Stats
  const activePromos = promotions.filter(p => p.status === "active");
  const totalRedemptions = redemptions.length;
  const totalRevenue = redemptions.reduce((sum, r) => sum + Number(r.discount_amount), 0);

  const promoTypeDistribution = promotions.reduce((acc, p) => {
    const label = p.type === "flash_sale" ? "Flash Sales" : p.type === "birthday" ? "Birthday" : p.type === "ai_suggested" ? "AI Suggested" : "Manual";
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.entries(promoTypeDistribution).map(([name, value]) => ({ name, value }));

  // Flash sale countdown
  const getCountdown = (endTime: string) => {
    const secs = differenceInSeconds(new Date(endTime), new Date());
    if (secs <= 0) return null;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active": return <Badge className="bg-success text-success-foreground">Active</Badge>;
      case "paused": return <Badge variant="secondary">Paused</Badge>;
      case "expired": return <Badge variant="outline">Expired</Badge>;
      case "completed": return <Badge className="bg-primary text-primary-foreground">Completed</Badge>;
      default: return <Badge variant="outline">Draft</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "flash_sale": return <Badge variant="destructive"><Zap className="w-3 h-3 mr-1" />Flash Sale</Badge>;
      case "birthday": return <Badge className="bg-pink-500 text-white"><Cake className="w-3 h-3 mr-1" />Birthday</Badge>;
      case "ai_suggested": return <Badge className="bg-purple-500 text-white"><Sparkles className="w-3 h-3 mr-1" />AI</Badge>;
      case "automated": return <Badge variant="secondary"><Target className="w-3 h-3 mr-1" />Auto</Badge>;
      default: return <Badge variant="outline">Manual</Badge>;
    }
  };

  const sharePromo = async (promo: Promotion) => {
    const text = `🎉 Special Offer!\n${promo.name}\n${promo.discount_type === "percentage" ? promo.discount_value + "% OFF" : formatCurrency(promo.discount_value) + " OFF"}\nUse code: ${promo.promo_code}\n${promo.end_time ? `Valid until ${format(new Date(promo.end_time), "MMM dd, yyyy")}` : ""}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: promo.name, text });
      } catch { /* cancelled */ }
    } else {
      navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "Promotion details copied to clipboard" });
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Smart Promotions</h1>
            <p className="text-muted-foreground text-sm">Manage campaigns, flash sales, and AI-powered promotions</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={createFlashSale}>
              <Zap className="h-4 w-4 mr-1" /> Flash Sale
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> New Promotion
            </Button>
          </div>
        </div>

        {/* Active Flash Sales Banner */}
        {activePromos.filter(p => p.type === "flash_sale" && p.end_time).map(promo => {
          const countdown = getCountdown(promo.end_time!);
          if (!countdown) return null;
          return (
            <Card key={promo.id} className="border-destructive bg-destructive/5 animate-pulse-slow">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <Zap className="h-6 w-6 text-destructive" />
                  <div>
                    <p className="font-bold text-destructive">{promo.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {promo.discount_type === "percentage" ? `${promo.discount_value}% OFF` : `${formatCurrency(promo.discount_value)} OFF`}
                      {promo.promo_code && ` • Code: ${promo.promo_code}`}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Ends in</p>
                  <p className="text-xl font-mono font-bold text-destructive">{countdown}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Stats Cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
              <Play className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activePromos.length}</div>
              <p className="text-xs text-muted-foreground">{promotions.length} total</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Redemptions</CardTitle>
              <CheckCircle className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalRedemptions}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Discount Given</CardTitle>
              <TrendingUp className="h-4 w-4 text-secondary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
              <p className="text-xs text-muted-foreground">Total discounts</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Birthday Promos</CardTitle>
              <Cake className="h-4 w-4 text-pink-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{promotions.filter(p => p.type === "birthday").length}</div>
              <p className="text-xs text-muted-foreground">Auto-generated</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">All Campaigns</TabsTrigger>
            <TabsTrigger value="flash">Flash Sales</TabsTrigger>
            <TabsTrigger value="ai">AI Suggestions</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          {/* ALL CAMPAIGNS */}
          <TabsContent value="overview" className="space-y-4">
            {promotions.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Gift className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No promotions yet. Create your first campaign!</p>
                  <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Create Promotion
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {promotions.map(promo => (
                  <Card key={promo.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            {getTypeBadge(promo.type)}
                            {getStatusBadge(promo.status)}
                            {promo.type === "flash_sale" && promo.end_time && promo.status === "active" && (() => {
                              const cd = getCountdown(promo.end_time);
                              return cd ? <Badge variant="outline" className="font-mono"><Clock className="w-3 h-3 mr-1" />{cd}</Badge> : null;
                            })()}
                          </div>
                          <p className="font-semibold truncate">{promo.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {promo.discount_type === "percentage" ? `${promo.discount_value}% OFF` : `${formatCurrency(promo.discount_value)} OFF`}
                            {promo.promo_code && ` • Code: ${promo.promo_code}`}
                          </p>
                          {promo.ai_reasoning && (
                            <p className="text-xs text-muted-foreground mt-1 italic">AI: {promo.ai_reasoning}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(promo.start_time), "MMM dd")}
                            {promo.end_time && ` — ${format(new Date(promo.end_time), "MMM dd, HH:mm")}`}
                            {" • "}{promo.current_redemptions} redemptions
                            {promo.max_redemptions && ` / ${promo.max_redemptions}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => sharePromo(promo)}>
                            <Share2 className="h-4 w-4" />
                          </Button>
                          {promo.promo_code && (
                            <Button variant="ghost" size="icon" onClick={() => {
                              navigator.clipboard.writeText(promo.promo_code!);
                              toast({ title: "Copied", description: promo.promo_code });
                            }}>
                              <Copy className="h-4 w-4" />
                            </Button>
                          )}
                          {(promo.status === "active" || promo.status === "paused") && (
                            <Button variant="ghost" size="icon" onClick={() => toggleStatus(promo)}>
                              {promo.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => deletePromotion(promo.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* FLASH SALES */}
          <TabsContent value="flash" className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">Time-limited flash sales with countdown timers</p>
              <Button size="sm" onClick={createFlashSale}>
                <Zap className="h-4 w-4 mr-1" /> New Flash Sale
              </Button>
            </div>
            {promotions.filter(p => p.type === "flash_sale").length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Zap className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No flash sales yet.</p>
                  <Button className="mt-4" onClick={createFlashSale}>Create Flash Sale</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {promotions.filter(p => p.type === "flash_sale").map(promo => {
                  const countdown = promo.end_time ? getCountdown(promo.end_time) : null;
                  const isLive = promo.status === "active" && countdown;
                  return (
                    <Card key={promo.id} className={isLive ? "border-destructive" : ""}>
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="text-base">{promo.name}</CardTitle>
                            <CardDescription>{promo.description}</CardDescription>
                          </div>
                          {getStatusBadge(promo.status)}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex justify-between items-end">
                          <div>
                            <p className="text-2xl font-bold text-destructive">
                              {promo.discount_type === "percentage" ? `${promo.discount_value}%` : formatCurrency(promo.discount_value)} OFF
                            </p>
                            {promo.promo_code && <p className="text-sm font-mono bg-muted px-2 py-1 rounded mt-1 inline-block">{promo.promo_code}</p>}
                          </div>
                          {isLive && (
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Time remaining</p>
                              <p className="text-3xl font-mono font-bold text-destructive">{countdown}</p>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 mt-3">
                          <Button variant="ghost" size="sm" onClick={() => sharePromo(promo)}>
                            <Share2 className="h-4 w-4 mr-1" /> Share
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => toggleStatus(promo)}>
                            {promo.status === "active" ? <><Pause className="h-4 w-4 mr-1" /> Pause</> : <><Play className="h-4 w-4 mr-1" /> Resume</>}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* AI SUGGESTIONS */}
          <TabsContent value="ai" className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-muted-foreground">AI analyzes your sales data and suggests optimal promotions</p>
              </div>
              <Button size="sm" onClick={fetchAISuggestions} disabled={aiLoading}>
                {aiLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                {aiLoading ? "Analyzing..." : "Get Suggestions"}
              </Button>
            </div>

            {/* Existing AI-launched promos */}
            {promotions.filter(p => p.type === "ai_suggested").length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">Active AI Campaigns</h3>
                <div className="grid gap-3">
                  {promotions.filter(p => p.type === "ai_suggested").map(promo => (
                    <Card key={promo.id} className="border-purple-200 dark:border-purple-800">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex gap-2 mb-1">{getTypeBadge(promo.type)} {getStatusBadge(promo.status)}</div>
                            <p className="font-semibold">{promo.name}</p>
                            {promo.ai_reasoning && <p className="text-sm text-muted-foreground mt-1">{promo.ai_reasoning}</p>}
                            <p className="text-sm mt-1">
                              {promo.discount_type === "percentage" ? `${promo.discount_value}%` : formatCurrency(promo.discount_value)} OFF
                              {promo.promo_code && ` • Code: ${promo.promo_code}`}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => toggleStatus(promo)}>
                              {promo.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => deletePromotion(promo.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* AI Suggestions */}
            {aiSuggestions.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-500" /> AI Recommendations
                </h3>
                <div className="grid gap-3">
                  {aiSuggestions.map((suggestion, idx) => (
                    <Card key={idx} className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 border-purple-200 dark:border-purple-800">
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row justify-between gap-3">
                          <div className="flex-1">
                            <p className="font-semibold">{suggestion.name}</p>
                            <p className="text-sm text-muted-foreground mt-1">{suggestion.description}</p>
                            <p className="text-sm mt-2">
                              <span className="font-medium">Discount:</span> {suggestion.discount_type === "percentage" ? `${suggestion.discount_value}%` : formatCurrency(suggestion.discount_value)}
                              {" • "}<span className="font-medium">Duration:</span> {suggestion.duration_hours}h
                            </p>
                            <p className="text-xs text-muted-foreground mt-1 italic">💡 {suggestion.reasoning}</p>
                            <p className="text-xs text-success mt-1">📈 {suggestion.expected_impact}</p>
                          </div>
                          <div className="flex sm:flex-col gap-2">
                            <Button size="sm" onClick={() => launchAISuggestion(suggestion)}>
                              <Play className="h-4 w-4 mr-1" /> Launch
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {aiSuggestions.length === 0 && !aiLoading && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Sparkles className="h-12 w-12 text-purple-300 mb-4" />
                  <p className="text-muted-foreground text-center">
                    Click "Get Suggestions" to let AI analyze your sales data<br />and recommend optimal promotions
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ANALYTICS */}
          <TabsContent value="analytics" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Promotion Type Distribution */}
              {pieData.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Promotions by Type</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name} (${value})`}>
                          {pieData.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Redemptions over time */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Redemption Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  {redemptions.length === 0 ? (
                    <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                      No redemptions yet
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={(() => {
                        const grouped: Record<string, number> = {};
                        redemptions.forEach(r => {
                          const day = format(new Date(r.redeemed_at), "MMM dd");
                          grouped[day] = (grouped[day] || 0) + 1;
                        });
                        return Object.entries(grouped).map(([name, count]) => ({ name, count }));
                      })()}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="name" className="text-xs" />
                        <YAxis className="text-xs" />
                        <Tooltip />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Top performing promotions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Promotions</CardTitle>
              </CardHeader>
              <CardContent>
                {promotions.filter(p => p.current_redemptions > 0).length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No redemptions tracked yet</p>
                ) : (
                  <div className="space-y-3">
                    {promotions
                      .filter(p => p.current_redemptions > 0)
                      .sort((a, b) => b.current_redemptions - a.current_redemptions)
                      .slice(0, 5)
                      .map(promo => (
                        <div key={promo.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {getTypeBadge(promo.type)}
                            <span className="font-medium text-sm">{promo.name}</span>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {promo.current_redemptions} uses
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Promotion Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {formType === "flash_sale" ? "⚡ Create Flash Sale" : "Create Promotion"}
            </DialogTitle>
            <DialogDescription>Set up a new promotional campaign</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Campaign Name *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g., Weekend Special" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Describe your promotion" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="flash_sale">Flash Sale</SelectItem>
                    <SelectItem value="automated">Automated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Discount Type</Label>
                <Select value={formDiscountType} onValueChange={setFormDiscountType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Discount Value *</Label>
                <Input type="number" value={formDiscountValue} onChange={e => setFormDiscountValue(e.target.value)} placeholder={formDiscountType === "percentage" ? "e.g., 20" : "e.g., 5000"} />
              </div>
              <div>
                <Label>Promo Code</Label>
                <Input value={formPromoCode} onChange={e => setFormPromoCode(e.target.value)} placeholder="Auto-generated" className="uppercase" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Time</Label>
                <Input type="datetime-local" value={formStartTime} onChange={e => setFormStartTime(e.target.value)} />
              </div>
              <div>
                <Label>End Time</Label>
                <Input type="datetime-local" value={formEndTime} onChange={e => setFormEndTime(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Max Redemptions</Label>
              <Input type="number" value={formMaxRedemptions} onChange={e => setFormMaxRedemptions(e.target.value)} placeholder="Unlimited" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Promotions;
