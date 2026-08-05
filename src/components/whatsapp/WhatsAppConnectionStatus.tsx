import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, ShieldCheck, ShieldAlert, Copy, Radio } from "lucide-react";

interface Health {
  configured?: boolean;
  enabled?: boolean;
  has_app_secret?: boolean;
  has_verify_token?: boolean;
  api_version?: string;
  last_webhook_at?: string | null;
  last_webhook_signature_ok?: boolean | null;
  last_webhook_error?: string | null;
  last_test_at?: string | null;
  last_test_status?: string | null;
  cloud_api?: {
    ok: boolean; error?: string; http_status?: number; code?: string | null;
    display_phone_number?: string | null; verified_name?: string | null; quality_rating?: string | null;
  };
  subscribed_fields?: string[] | null;
  error?: string;
}

function Dot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-green-500" : warn ? "bg-amber-500" : "bg-red-500"}`} />;
}

function Row({ ok, warn, label, value }: { ok: boolean; warn?: boolean; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b last:border-0 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground"><Dot ok={ok} warn={warn} />{label}</span>
      <span className="text-right break-words">{value}</span>
    </div>
  );
}

export default function WhatsAppConnectionStatus({ webhookUrl }: { webhookUrl: string }) {
  const { toast } = useToast();
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("whatsapp-health", { body: {} });
    setHealth(error ? { error: error.message } : (data as Health));
    setLoading(false);
  }, []);

  useEffect(() => { check(); }, [check]);

  const cloudOk = !!health?.cloud_api?.ok;
  const webhookRecent = !!health?.last_webhook_at
    && Date.now() - new Date(health.last_webhook_at).getTime() < 7 * 24 * 60 * 60 * 1000;

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium text-sm">
          <Radio className="h-4 w-4" />Connection status
        </div>
        <Button size="sm" variant="outline" onClick={check} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
          Re-check
        </Button>
      </div>

      {loading && !health ? (
        <div className="py-4 flex justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : health?.error ? (
        <p className="text-sm text-destructive">{health.error}</p>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Cloud API</div>
            <Row
              ok={cloudOk}
              label="Meta Graph connection"
              value={cloudOk
                ? <Badge variant="secondary">Live</Badge>
                : <span className="text-destructive text-xs">{health?.cloud_api?.error || "Not connected"}</span>}
            />
            {cloudOk && (
              <>
                <Row ok label="Business number" value={health?.cloud_api?.display_phone_number || "—"} />
                <Row ok label="Verified name" value={health?.cloud_api?.verified_name || "—"} />
                <Row
                  ok={health?.cloud_api?.quality_rating !== "RED"}
                  warn={health?.cloud_api?.quality_rating === "YELLOW"}
                  label="Quality rating"
                  value={health?.cloud_api?.quality_rating || "—"}
                />
              </>
            )}
            <Row ok={!!health?.enabled} label="Sending enabled" value={health?.enabled ? "Yes" : "No"} />
            <Row
              ok={health?.last_test_status === "ok"}
              warn={!health?.last_test_at}
              label="Last test message"
              value={health?.last_test_at
                ? `${new Date(health.last_test_at).toLocaleString()} — ${health.last_test_status}`
                : "Never tested"}
            />
          </div>

          <div>
            <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Webhook</div>
            <Row
              ok={!!health?.has_app_secret}
              label="Signature verification"
              value={health?.has_app_secret
                ? <span className="inline-flex items-center gap-1 text-green-600"><ShieldCheck className="h-3.5 w-3.5" />Enforced</span>
                : <span className="inline-flex items-center gap-1 text-destructive"><ShieldAlert className="h-3.5 w-3.5" />Add App Secret</span>}
            />
            <Row ok={!!health?.has_verify_token} label="Verify token" value={health?.has_verify_token ? "Set" : "Missing"} />
            <Row
              ok={webhookRecent}
              warn={!!health?.last_webhook_at && !webhookRecent}
              label="Last callback received"
              value={health?.last_webhook_at ? new Date(health.last_webhook_at).toLocaleString() : "Never"}
            />
            {health?.last_webhook_error && (
              <p className="text-xs text-amber-600 pt-1">{health.last_webhook_error}</p>
            )}
            {health?.subscribed_fields && (
              <Row
                ok={health.subscribed_fields.includes("messages")}
                label="Subscribed fields"
                value={health.subscribed_fields.length ? health.subscribed_fields.join(", ") : "None"}
              />
            )}
            <div className="flex items-center gap-2 pt-2">
              <code className="text-[11px] break-all flex-1 bg-muted/50 rounded px-2 py-1">{webhookUrl}</code>
              <Button
                size="icon" variant="outline"
                onClick={() => { navigator.clipboard.writeText(webhookUrl); toast({ title: "Copied", description: "Webhook URL copied." }); }}
                aria-label="Copy webhook URL"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
