import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileText, Send } from "lucide-react";
import { sendWhatsapp, uploadWhatsAppPdf } from "@/lib/whatsapp";
import {
  DOCUMENT_LABELS, buildDocument, listDocumentRecords,
  type DocumentKind, type DocumentRecordOption,
} from "@/lib/whatsappDocuments";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string | null;
  phone: string;
  customerId: string | null;
  onSent?: () => void;
}

const KINDS: DocumentKind[] = ["receipt", "invoice", "purchase_order", "statement", "account_balance"];

export default function SendDocumentDialog({ open, onOpenChange, tenantId, phone, customerId, onSent }: Props) {
  const { toast } = useToast();
  const [kind, setKind] = useState<DocumentKind>("receipt");
  const [records, setRecords] = useState<DocumentRecordOption[]>([]);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [caption, setCaption] = useState("");

  useEffect(() => {
    if (!open || !tenantId) return;
    let active = true;
    setLoading(true);
    setRecordId(null);
    listDocumentRecords(kind, { tenantId, customerId })
      .then((rows) => { if (active) { setRecords(rows); setRecordId(rows[0]?.id ?? null); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, kind, tenantId, customerId]);

  const submit = async () => {
    if (!tenantId || !recordId) return;
    setSending(true);
    try {
      const doc = await buildDocument(kind, recordId, { tenantId });
      const url = await uploadWhatsAppPdf(tenantId, doc.filename, doc.blob, "documents");
      await sendWhatsapp({
        to: phone,
        body: caption.trim() || doc.caption,
        media_url: url,
        media_kind: "pdf",
        media_filename: doc.filename,
        message_type: kind === "receipt" ? "receipt" : "custom",
        customer_id: customerId,
      });
      toast({ title: "Document sent", description: `${DOCUMENT_LABELS[kind]} delivered as a PDF attachment.` });
      setCaption("");
      onOpenChange(false);
      onSent?.();
    } catch (e) {
      toast({ title: "Could not send", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Send a document</DialogTitle>
          <DialogDescription>Attach a PDF receipt, invoice, purchase order, statement or balance to this chat.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto">
          <div>
            <Label>Document type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as DocumentKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => <SelectItem key={k} value={k}>{DOCUMENT_LABELS[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Record</Label>
            {loading ? (
              <div className="py-6 flex justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : records.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3">
                {kind === "statement" || kind === "account_balance"
                  ? "Link this chat to a customer record first to generate this document."
                  : "No records available yet."}
              </p>
            ) : (
              <ScrollArea className="max-h-52 border rounded-md mt-1">
                {records.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setRecordId(r.id)}
                    className={`w-full text-left px-3 py-2 border-b last:border-0 text-sm hover:bg-muted/60 ${recordId === r.id ? "bg-muted" : ""}`}
                  >
                    <div className="font-medium truncate">{r.label}</div>
                    <div className="text-xs text-muted-foreground">{r.sublabel}</div>
                  </button>
                ))}
              </ScrollArea>
            )}
          </div>

          <div>
            <Label>Message (optional)</Label>
            <Textarea rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Leave blank to use the default caption" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={sending || !recordId}>
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
