import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Plus, Trash2 } from "lucide-react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function WhatsAppAutomationSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [s, setS] = useState<any>({
    greeting_enabled: false, greeting_message: "",
    away_enabled: false, away_message: "",
    instant_reply_enabled: false, instant_reply_message: "",
    holiday_enabled: false, holiday_message: "",
    business_open_time: "08:00", business_close_time: "18:00",
    closed_days: [], auto_create_customers: true, notify_on_incoming: true,
  });
  const [replies, setReplies] = useState<any[]>([]);
  const [newReply, setNewReply] = useState({ shortcut: "", title: "", body: "" });

  const load = async () => {
    const { data: prof } = await supabase.from("profiles").select("tenant_id").maybeSingle();
    setTenantId(prof?.tenant_id ?? null);
    const { data } = await supabase.from("whatsapp_settings").select("*").maybeSingle();
    if (data) setS((prev: any) => ({ ...prev, ...data, closed_days: Array.isArray(data.closed_days) ? data.closed_days : [] }));
    const { data: qr } = await supabase.from("whatsapp_quick_replies").select("*").order("shortcut");
    setReplies(qr || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!tenantId) return;
    setSaving(true);
    const { error } = await supabase.from("whatsapp_settings").upsert({
      tenant_id: tenantId,
      greeting_enabled: s.greeting_enabled, greeting_message: s.greeting_message,
      away_enabled: s.away_enabled, away_message: s.away_message,
      instant_reply_enabled: s.instant_reply_enabled, instant_reply_message: s.instant_reply_message,
      holiday_enabled: s.holiday_enabled, holiday_message: s.holiday_message,
      business_open_time: s.business_open_time, business_close_time: s.business_close_time,
      closed_days: s.closed_days, auto_create_customers: s.auto_create_customers,
      notify_on_incoming: s.notify_on_incoming,
    }, { onConflict: "tenant_id" });
    setSaving(false);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else toast({ title: "Saved", description: "Automation settings updated." });
  };

  const addReply = async () => {
    if (!tenantId || !newReply.shortcut || !newReply.body) return;
    const { error } = await supabase.from("whatsapp_quick_replies").insert({
      tenant_id: tenantId,
      shortcut: newReply.shortcut.replace(/^\//, ""),
      title: newReply.title || newReply.shortcut,
      body: newReply.body,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setNewReply({ shortcut: "", title: "", body: "" });
    load();
  };

  const removeReply = async (id: string) => {
    await supabase.from("whatsapp_quick_replies").delete().eq("id", id);
    load();
  };

  const toggleDay = (i: number) => {
    const days: number[] = s.closed_days || [];
    setS({ ...s, closed_days: days.includes(i) ? days.filter((d) => d !== i) : [...days, i] });
  };

  if (loading) return <Loader2 className="h-5 w-5 animate-spin" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Auto Replies & Business Hours</CardTitle>
          <CardDescription>Automatic responses sent when customers message you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: "greeting", label: "Greeting message (first-time contacts)" },
            { key: "instant_reply", label: "Instant reply (every new message)" },
            { key: "away", label: "Away message (outside business hours)" },
            { key: "holiday", label: "Holiday message (overrides others)" },
          ].map((item) => (
            <div key={item.key} className="space-y-2 border rounded-md p-3">
              <div className="flex items-center justify-between">
                <Label>{item.label}</Label>
                <Switch
                  checked={!!s[`${item.key}_enabled`]}
                  onCheckedChange={(v) => setS({ ...s, [`${item.key}_enabled`]: v })}
                />
              </div>
              <Textarea
                rows={2}
                value={s[`${item.key}_message`] || ""}
                onChange={(e) => setS({ ...s, [`${item.key}_message`]: e.target.value })}
                placeholder="Type the automatic message…"
              />
            </div>
          ))}

          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Opening time (UTC)</Label><Input type="time" value={s.business_open_time || "08:00"} onChange={(e) => setS({ ...s, business_open_time: e.target.value })} /></div>
            <div><Label>Closing time (UTC)</Label><Input type="time" value={s.business_close_time || "18:00"} onChange={(e) => setS({ ...s, business_close_time: e.target.value })} /></div>
          </div>
          <div>
            <Label>Closed days</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {DAYS.map((d, i) => (
                <Button key={d} type="button" size="sm" variant={(s.closed_days || []).includes(i) ? "default" : "outline"} onClick={() => toggleDay(i)}>{d}</Button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between border rounded-md p-3">
            <Label>Auto-create customer records from new chats</Label>
            <Switch checked={!!s.auto_create_customers} onCheckedChange={(v) => setS({ ...s, auto_create_customers: v })} />
          </div>
          <div className="flex items-center justify-between border rounded-md p-3">
            <Label>Notify me when a customer messages</Label>
            <Switch checked={!!s.notify_on_incoming} onCheckedChange={(v) => setS({ ...s, notify_on_incoming: v })} />
          </div>

          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick Replies</CardTitle>
          <CardDescription>Type <code>/shortcut</code> then space in the chat box to insert saved text.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[120px_160px_1fr_auto] items-end">
            <div><Label>Shortcut</Label><Input value={newReply.shortcut} onChange={(e) => setNewReply({ ...newReply, shortcut: e.target.value })} placeholder="thanks" /></div>
            <div><Label>Title</Label><Input value={newReply.title} onChange={(e) => setNewReply({ ...newReply, title: e.target.value })} placeholder="Thank you" /></div>
            <div><Label>Message</Label><Input value={newReply.body} onChange={(e) => setNewReply({ ...newReply, body: e.target.value })} placeholder="Thank you for shopping with us!" /></div>
            <Button onClick={addReply}><Plus className="h-4 w-4" /></Button>
          </div>
          <div className="space-y-2">
            {replies.map((r) => (
              <div key={r.id} className="flex items-center gap-2 border rounded-md p-2 text-sm">
                <Badge>/{r.shortcut}</Badge>
                <span className="font-medium">{r.title}</span>
                <span className="text-muted-foreground truncate flex-1">{r.body}</span>
                <Button size="icon" variant="ghost" onClick={() => removeReply(r.id)} aria-label="Delete quick reply">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            {replies.length === 0 && <p className="text-sm text-muted-foreground">No quick replies yet.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
