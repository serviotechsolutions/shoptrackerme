import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MessageCircle, AlertCircle, FileText } from "lucide-react";
import { normalizePhone, sendWhatsapp, generateReceiptPdf, uploadReceiptPdf, buildReceiptMessage, type ReceiptData, type SendArgs } from "@/lib/whatsapp";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultPhone?: string;
  defaultBody?: string;
  customerId?: string | null;
  customerName?: string | null;
  messageType?: SendArgs["message_type"];
  relatedSaleId?: string | null;
  relatedPaymentId?: string | null;
  receipt?: ReceiptData; // when present, PDF option is available
  title?: string;
  onSent?: () => void;
}

export default function WhatsAppSendDialog({
  open, onOpenChange, defaultPhone, defaultBody, customerId, customerName,
  messageType = "custom", relatedSaleId, relatedPaymentId, receipt, title, onSent,
}: Props) {
  const { toast } = useToast();
  const [phone, setPhone] = useState(defaultPhone || "");
  const [body, setBody] = useState(defaultBody || "");
  const [sending, setSending] = useState(false);
  const [attachPdf, setAttachPdf] = useState<boolean>(!!receipt);
  const [defaultFormat, setDefaultFormat] = useState<string>("pdf");
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhone(defaultPhone || "");
    setBody(defaultBody || (receipt ? buildReceiptMessage(receipt.shopName, receipt) : ""));
    setAttachPdf(!!receipt);
    (async () => {
      const { data } = await supabase.from("whatsapp_settings")
        .select("is_enabled, default_format, provider, access_token, phone_number_id, account_sid, from_number").maybeSingle();
      if (data) {
        const providerReady = (data as any).provider === "twilio"
          ? !!((data as any).account_sid && (data as any).from_number)
          : !!((data as any).access_token && (data as any).phone_number_id);
        setIsConfigured(!!(data.is_enabled && providerReady));
        if (data.default_format) setDefaultFormat(data.default_format);
        if (data.default_format === "text") setAttachPdf(false);
      } else {
        setIsConfigured(false);
      }
    })();
  }, [open, defaultPhone, defaultBody, receipt]);

  const normalized = useMemo(() => normalizePhone(phone), [phone]);
  const phoneError = phone && !normalized ? "Enter a valid phone number (e.g. +256700000000)" : null;

  const handleSend = async () => {
    if (!normalized) { toast({ title: "Invalid phone", description: "Please enter a valid WhatsApp number.", variant: "destructive" }); return; }
    if (!body && !attachPdf) { toast({ title: "Empty message", description: "Type a message or attach the receipt.", variant: "destructive" }); return; }
    setSending(true);
    try {
      let mediaUrl: string | undefined;
      if (attachPdf && receipt) {
        const { data: profile } = await supabase.from("profiles").select("tenant_id").maybeSingle();
        if (!profile?.tenant_id) throw new Error("Missing tenant");
        const blob = await generateReceiptPdf(receipt);
        mediaUrl = await uploadReceiptPdf(profile.tenant_id, receipt.invoiceNumber, blob);
      }
      await sendWhatsapp({
        to: normalized,
        body: body || undefined,
        media_url: mediaUrl,
        media_kind: mediaUrl ? "pdf" : null,
        message_type: messageType,
        customer_id: customerId ?? null,
        related_sale_id: relatedSaleId ?? null,
        related_payment_id: relatedPaymentId ?? null,
      });
      toast({ title: "Sent", description: "WhatsApp message queued for delivery." });
      onOpenChange(false);
      onSent?.();
    } catch (e) {
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-green-600" />{title || "Send via WhatsApp"}</DialogTitle>
          {customerName && <DialogDescription>To: {customerName}</DialogDescription>}
        </DialogHeader>
        {isConfigured === false && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm flex gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>WhatsApp is not configured. Ask an admin to set it up under <b>Settings → WhatsApp</b>.</div>
          </div>
        )}
        <div className="space-y-3">
          <div>
            <Label>Recipient phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+256700000000" />
            {phoneError && <p className="text-xs text-destructive mt-1">{phoneError}</p>}
            {normalized && <p className="text-xs text-muted-foreground mt-1">Will send to: {normalized}</p>}
          </div>
          <div>
            <Label>Message</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Type your message..." />
          </div>
          {receipt && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={attachPdf} onChange={(e) => setAttachPdf(e.target.checked)} />
              <FileText className="h-4 w-4" /> Attach PDF receipt {defaultFormat === "pdf" && <span className="text-xs text-muted-foreground">(default)</span>}
            </label>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending || isConfigured === false} className="bg-green-600 hover:bg-green-700 text-white">
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageCircle className="mr-2 h-4 w-4" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
