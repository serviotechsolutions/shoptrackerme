import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { normalizePhone, sendWhatsapp } from "@/lib/whatsapp";
import { Loader2, MessageCircle, Save, TestTube2, Send, RefreshCw, Download } from "lucide-react";

interface Settings {
  id?: string;
  tenant_id?: string;
  provider: string;
  // Meta Cloud API (default)
  access_token: string | null;
  phone_number_id: string | null;
  business_account_id: string | null;
  verify_token: string | null;
  api_version: string;
  // Legacy Twilio (kept for future providers)
  account_sid: string | null;
  auth_token: string | null;
  from_number: string | null;
  business_name: string | null;
  default_format: string;
  max_per_minute: number;
  max_per_day: number;
  max_bulk: number;
  is_enabled: boolean;
  last_test_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
}

const DEFAULT: Settings = {
  provider: "meta",
  access_token: "", phone_number_id: "", business_account_id: "", verify_token: "", api_version: "v20.0",
  account_sid: "", auth_token: "", from_number: "", business_name: "",
  default_format: "pdf", max_per_minute: 20, max_per_day: 1000, max_bulk: 200, is_enabled: false,
  last_test_at: null, last_test_status: null, last_test_error: null,
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    delivered: "bg-green-500", read: "bg-blue-500", sent: "bg-emerald-500",
    pending: "bg-amber-500", failed: "bg-red-500",
  };
  return <Badge className={`${map[status] || "bg-gray-500"} text-white capitalize`}>{status}</Badge>;
}

export default function WhatsApp() {
  const { toast } = useToast();
  const { isAdmin } = useUserRole();
  const [tab, setTab] = useState("settings");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT);
  const [testPhone, setTestPhone] = useState("");

  // History
  const [messages, setMessages] = useState<any[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Bulk
  const [bulkTargets, setBulkTargets] = useState<string>("all_active");
  const [bulkBody, setBulkBody] = useState("");
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<number>(0);

  useEffect(() => { load(); loadMessages(); }, []);
  useEffect(() => { if (tab === "bulk") previewBulk(); }, [tab, bulkTargets]);

  const load = async () => {
    setLoading(true);
    const { data: prof } = await supabase.from("profiles").select("tenant_id").maybeSingle();
    if (!prof?.tenant_id) { setLoading(false); return; }
    const { data } = await supabase.from("whatsapp_settings").select("*").eq("tenant_id", prof.tenant_id).maybeSingle();
    if (data) setSettings({ ...DEFAULT, ...data });
    else setSettings({ ...DEFAULT, tenant_id: prof.tenant_id });
    setLoading(false);
  };

  const loadMessages = async () => {
    const { data } = await supabase.from("whatsapp_messages")
      .select("*, customers(name)").order("created_at", { ascending: false }).limit(500);
    setMessages(data || []);
  };

  const save = async () => {
    if (!isAdmin) return;
    setSaving(true);
    try {
      const { data: prof } = await supabase.from("profiles").select("tenant_id").maybeSingle();
      if (!prof?.tenant_id) throw new Error("No tenant");
      const payload = { ...settings, tenant_id: prof.tenant_id };
      const { error } = await supabase.from("whatsapp_settings")
        .upsert(payload, { onConflict: "tenant_id" });
      if (error) throw error;
      toast({ title: "Saved", description: "WhatsApp settings updated." });
      await load();
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const runTest = async () => {
    const to = normalizePhone(testPhone);
    if (!to) { toast({ title: "Invalid phone", variant: "destructive" }); return; }
    setTesting(true);
    try {
      await sendWhatsapp({
        to, body: `✅ ShopTracker WhatsApp test from ${settings.business_name || "your shop"} — connection is working.`,
        message_type: "test", test: true,
      });
      toast({ title: "Test sent", description: "Check the recipient's WhatsApp." });
      await load(); await loadMessages();
    } catch (e) {
      toast({ title: "Test failed", description: (e as Error).message, variant: "destructive" });
      await load();
    } finally { setTesting(false); }
  };

  const previewBulk = async () => {
    let q: any = supabase.from("customers").select("id", { count: "exact", head: true });
    if (bulkTargets === "all_active") q = q.eq("status", "active");
    else if (bulkTargets === "inactive") q = q.eq("status", "inactive");
    else if (bulkTargets === "vip") q = q.eq("is_vip", true);
    const { count } = await q;
    setBulkPreview(count || 0);
  };

  const runBulk = async () => {
    if (!isAdmin) return;
    if (!bulkBody.trim()) { toast({ title: "Empty message", variant: "destructive" }); return; }
    if (!confirm(`Send WhatsApp to ~${bulkPreview} customers?`)) return;
    setBulkSending(true);
    try {
      let q: any = supabase.from("customers").select("id, name, phone").not("phone", "is", null);
      if (bulkTargets === "all_active") q = q.eq("status", "active");
      else if (bulkTargets === "inactive") q = q.eq("status", "inactive");
      else if (bulkTargets === "vip") q = q.eq("is_vip", true);
      const { data: list } = await q.limit(settings.max_bulk);
      let ok = 0, fail = 0;
      for (const c of list || []) {
        const to = normalizePhone(c.phone);
        if (!to) { fail++; continue; }
        try {
          await sendWhatsapp({ to, body: bulkBody, message_type: "promotion", customer_id: c.id });
          ok++;
        } catch { fail++; }
        // Small pacing to respect per-minute limits
        await new Promise(r => setTimeout(r, 300));
      }
      toast({ title: "Bulk finished", description: `Sent ${ok}, failed ${fail}.` });
      await loadMessages();
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally { setBulkSending(false); }
  };

  const filtered = useMemo(() => {
    return messages.filter(m => {
      if (filterStatus !== "all" && m.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!(m.recipient_phone?.toLowerCase().includes(q) ||
              m.customers?.name?.toLowerCase().includes(q) ||
              m.body?.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [messages, filterStatus, search]);

  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const t = messages.filter(m => new Date(m.created_at) >= today);
    const sent = messages.filter(m => ["sent","delivered","read"].includes(m.status)).length;
    const delivered = messages.filter(m => ["delivered","read"].includes(m.status)).length;
    const read = messages.filter(m => m.status === "read").length;
    const failed = messages.filter(m => m.status === "failed").length;
    return {
      today: t.length,
      todayDelivered: t.filter(m => ["delivered","read"].includes(m.status)).length,
      todayFailed: t.filter(m => m.status === "failed").length,
      todayPending: t.filter(m => m.status === "pending").length,
      total: messages.length, sent, delivered, read, failed,
      deliveryRate: sent ? Math.round((delivered / sent) * 100) : 0,
      readRate: sent ? Math.round((read / sent) * 100) : 0,
      failureRate: messages.length ? Math.round((failed / messages.length) * 100) : 0,
    };
  }, [messages]);

  const retry = async (m: any) => {
    try {
      await sendWhatsapp({
        to: m.recipient_phone, body: m.body || undefined, media_url: m.media_url || undefined,
        media_kind: m.media_kind, message_type: m.message_type, customer_id: m.customer_id,
        related_sale_id: m.related_sale_id, related_payment_id: m.related_payment_id,
      });
      toast({ title: "Resent" });
      await loadMessages();
    } catch (e) {
      toast({ title: "Retry failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const exportCsv = () => {
    const rows = [
      ["Date","Type","Recipient","Customer","Status","Error","Sid"],
      ...filtered.map(m => [
        new Date(m.created_at).toISOString(),
        m.message_type, m.recipient_phone, m.customers?.name || "", m.status,
        m.error_message || "", m.provider_message_id || ""
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `whatsapp-messages-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const connectionStatus = settings.is_enabled && settings.account_sid && settings.from_number
    ? { label: "🟢 Connected", tone: "text-green-600" }
    : settings.account_sid || settings.from_number
      ? { label: "🟡 Pending Configuration", tone: "text-amber-600" }
      : { label: "🔴 Disconnected", tone: "text-red-600" };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-6 w-6 text-green-600" />
          <h1 className="text-xl font-bold">WhatsApp</h1>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Sent today</div><div className="text-2xl font-bold">{stats.today}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Delivered today</div><div className="text-2xl font-bold text-green-600">{stats.todayDelivered}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Failed today</div><div className="text-2xl font-bold text-red-600">{stats.todayFailed}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Pending</div><div className="text-2xl font-bold text-amber-600">{stats.todayPending}</div></CardContent></Card>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex flex-wrap">
            {isAdmin && <TabsTrigger value="settings">Settings</TabsTrigger>}
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            {isAdmin && <TabsTrigger value="bulk">Bulk</TabsTrigger>}
          </TabsList>

          {isAdmin && (
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Provider Configuration</span>
                  <span className={`text-sm font-medium ${connectionStatus.tone}`}>{connectionStatus.label}</span>
                </CardTitle>
                <CardDescription>
                  Credentials are stored server-side and only used by the send/webhook functions. Never exposed in the browser after saving.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>Provider</Label>
                        <Select value={settings.provider} onValueChange={(v) => setSettings({ ...settings, provider: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="twilio">Twilio WhatsApp</SelectItem>
                            <SelectItem value="meta" disabled>Meta Cloud API (coming)</SelectItem>
                            <SelectItem value="bsp" disabled>WhatsApp Business (BSP)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Business name (shown in messages)</Label>
                        <Input value={settings.business_name || ""} onChange={(e) => setSettings({ ...settings, business_name: e.target.value })} />
                      </div>
                      <div>
                        <Label>Twilio Account SID</Label>
                        <Input value={settings.account_sid || ""} onChange={(e) => setSettings({ ...settings, account_sid: e.target.value })} placeholder="ACxxxxxxxx..." />
                      </div>
                      <div>
                        <Label>Twilio Auth Token</Label>
                        <Input type="password" value={settings.auth_token || ""} onChange={(e) => setSettings({ ...settings, auth_token: e.target.value })} placeholder="•••••••••••" />
                      </div>
                      <div>
                        <Label>WhatsApp sender number (E.164)</Label>
                        <Input value={settings.from_number || ""} onChange={(e) => setSettings({ ...settings, from_number: e.target.value })} placeholder="+14155238886" />
                        <p className="text-xs text-muted-foreground mt-1">Your Twilio-approved WhatsApp number. The 'whatsapp:' prefix is added automatically.</p>
                      </div>
                      <div>
                        <Label>Default receipt format</Label>
                        <Select value={settings.default_format} onValueChange={(v) => setSettings({ ...settings, default_format: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pdf">PDF attachment</SelectItem>
                            <SelectItem value="text">Text only</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Max messages / minute</Label>
                        <Input type="number" value={settings.max_per_minute} onChange={(e) => setSettings({ ...settings, max_per_minute: Number(e.target.value) })} />
                      </div>
                      <div>
                        <Label>Max messages / day</Label>
                        <Input type="number" value={settings.max_per_day} onChange={(e) => setSettings({ ...settings, max_per_day: Number(e.target.value) })} />
                      </div>
                      <div>
                        <Label>Max bulk recipients</Label>
                        <Input type="number" value={settings.max_bulk} onChange={(e) => setSettings({ ...settings, max_bulk: Number(e.target.value) })} />
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={settings.is_enabled} onChange={(e) => setSettings({ ...settings, is_enabled: e.target.checked })} />
                          Enable WhatsApp sending
                        </label>
                      </div>
                    </div>

                    <div className="rounded-md border p-3 bg-muted/40 text-xs space-y-1">
                      <div><b>Delivery status webhook:</b></div>
                      <code className="break-all">https://{import.meta.env.VITE_SUPABASE_PROJECT_ID}.functions.supabase.co/whatsapp-status</code>
                      <div className="text-muted-foreground">Configure this URL in Twilio Console → Messaging → WhatsApp sender → Status Callback URL.</div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save</Button>
                    </div>

                    <div className="border-t pt-4">
                      <Label>Send test message</Label>
                      <div className="flex flex-col sm:flex-row gap-2 mt-1">
                        <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="+256700000000" />
                        <Button onClick={runTest} disabled={testing || !settings.is_enabled}>
                          {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube2 className="mr-2 h-4 w-4" />}
                          Test connection
                        </Button>
                      </div>
                      {settings.last_test_at && (
                        <p className="text-xs mt-2">
                          Last test: {new Date(settings.last_test_at).toLocaleString()} — <span className={settings.last_test_status === "ok" ? "text-green-600" : "text-red-600"}>{settings.last_test_status}</span>
                          {settings.last_test_error && <> ({settings.last_test_error})</>}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          )}

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Message History</CardTitle>
                <CardDescription>All WhatsApp messages sent from this shop.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Input placeholder="Search phone, name, text..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="read">Read</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={loadMessages}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
                  <Button variant="outline" size="sm" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
                </div>
                <div className="overflow-x-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Error</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No messages</TableCell></TableRow>}
                      {filtered.map(m => (
                        <TableRow key={m.id}>
                          <TableCell className="text-xs">{new Date(m.created_at).toLocaleString()}</TableCell>
                          <TableCell className="capitalize">{m.message_type}</TableCell>
                          <TableCell>{m.recipient_phone}</TableCell>
                          <TableCell>{m.customers?.name || "-"}</TableCell>
                          <TableCell><StatusBadge status={m.status} /></TableCell>
                          <TableCell className="text-xs text-red-600 max-w-[200px] truncate">{m.error_message}</TableCell>
                          <TableCell>{m.status === "failed" && <Button size="sm" variant="outline" onClick={() => retry(m)}>Retry</Button>}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total messages</div><div className="text-2xl font-bold">{stats.total}</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Delivery rate</div><div className="text-2xl font-bold">{stats.deliveryRate}%</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Read rate</div><div className="text-2xl font-bold">{stats.readRate}%</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Failure rate</div><div className="text-2xl font-bold">{stats.failureRate}%</div></CardContent></Card>
            </div>
          </TabsContent>

          {isAdmin && (
          <TabsContent value="bulk">
            <Card>
              <CardHeader>
                <CardTitle>Bulk WhatsApp Campaign</CardTitle>
                <CardDescription>Send a promotional message to a customer group. Pacing respects your per-minute limit.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Recipient group</Label>
                    <Select value={bulkTargets} onValueChange={setBulkTargets}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All customers with phone</SelectItem>
                        <SelectItem value="all_active">Active customers</SelectItem>
                        <SelectItem value="inactive">Inactive customers</SelectItem>
                        <SelectItem value="vip">VIP customers</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">Estimated recipients: <b>{bulkPreview}</b> (max {settings.max_bulk})</p>
                  </div>
                </div>
                <div>
                  <Label>Message</Label>
                  <Textarea rows={6} value={bulkBody} onChange={(e) => setBulkBody(e.target.value)} placeholder="🎉 Flash sale today! 20% off all rice at ShopTracker. Use code SAVE20." />
                </div>
                <Button onClick={runBulk} disabled={bulkSending} className="bg-green-600 hover:bg-green-700 text-white">
                  {bulkSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Send campaign
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
