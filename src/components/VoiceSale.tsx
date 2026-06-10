import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Mic, MicOff, Loader2, Volume2, Keyboard, CheckCircle, ShoppingCart, User, Banknote } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

export interface VoiceProduct {
  id: string;
  name: string;
  selling_price: number;
  buying_price: number;
  stock: number;
}

export interface VoiceCustomer {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
}

export interface ResolvedVoiceItem {
  product: VoiceProduct;
  quantity: number;
  unitPrice: number | null;
}

export interface VoiceApplyResult {
  transcript: string;
  items: ResolvedVoiceItem[];
  discount: { kind: "percentage" | "fixed"; value: number } | null;
  priceUpdates: { product: VoiceProduct; newPrice: number }[];
  summary: string;
}

export interface VoiceCompleteData {
  transcript: string;
  items: ResolvedVoiceItem[];
  discount: { kind: "percentage" | "fixed"; value: number } | null;
  customer: { id: string | null; name: string } | null;
  payment: { amount: number | null; method: string | null } | null;
  receiptAction: "print" | "download" | "whatsapp" | "email" | null;
  summary: string;
}

interface ParsedItem {
  query: string;
  product_id: string | null;
  candidate_ids: string[];
  quantity: number;
  unit_price: number | null;
}

interface ParsedResult {
  items: ParsedItem[];
  discount: { kind: "percentage" | "fixed"; value: number } | null;
  price_updates: { product_id: string; new_price: number }[];
  customer: { query: string; customer_id: string | null } | null;
  payment: { amount: number | null; method: string | null } | null;
  receipt_action: "print" | "download" | "whatsapp" | "email" | null;
  summary: string;
}

interface VoiceSaleProps {
  products: VoiceProduct[];
  customers: VoiceCustomer[];
  onApply: (result: VoiceApplyResult) => Promise<string | void>;
  onCompleteSale: (data: VoiceCompleteData) => Promise<string | void>;
}

const speak = (text: string, onEnd?: () => void) => {
  try {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1;
      if (onEnd) utter.onend = () => onEnd();
      window.speechSynthesis.speak(utter);
      return;
    }
  } catch { /* ignore */ }
  if (onEnd) onEnd();
};

const fmt = (n: number) => `UGX ${Math.round(n).toLocaleString()}`;

const methodLabel = (m: string | null) =>
  ({ cash: "Cash", mobile_money: "Mobile Money", card: "Card", other: "Other" } as Record<string, string>)[m || ""] || "Cash";

export const VoiceSale = ({ products, customers, onApply, onCompleteSale }: VoiceSaleProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [manualText, setManualText] = useState("");
  const [ambiguous, setAmbiguous] = useState<{ item: ParsedItem; candidates: VoiceProduct[] }[]>([]);
  const [pendingParsed, setPendingParsed] = useState<ParsedResult | null>(null);
  const [resolvedItems, setResolvedItems] = useState<ResolvedVoiceItem[]>([]);
  const [review, setReview] = useState<VoiceCompleteData | null>(null);
  const [confirmListening, setConfirmListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const confirmRecRef = useRef<any>(null);
  const finalRef = useRef("");
  const reviewRef = useRef<VoiceCompleteData | null>(null);

  const speechSupported = typeof window !== "undefined" &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  useEffect(() => () => {
    try { recognitionRef.current?.abort?.(); } catch { /* */ }
    try { confirmRecRef.current?.abort?.(); } catch { /* */ }
    try { window.speechSynthesis?.cancel(); } catch { /* */ }
  }, []);

  const reset = () => {
    setTranscript(""); setInterim(""); setAmbiguous([]); setPendingParsed(null);
    setResolvedItems([]); setManualText(""); setReview(null); reviewRef.current = null;
    setConfirmListening(false); finalRef.current = "";
    try { confirmRecRef.current?.abort?.(); } catch { /* */ }
  };

  const startListening = () => {
    if (!window.isSecureContext) {
      toast({ title: "HTTPS Required", description: "Voice commands require a secure (HTTPS) connection.", variant: "destructive" });
      setManualMode(true);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setManualMode(true);
      toast({ title: "Voice not supported", description: "Your browser doesn't support speech recognition. Type the command instead." });
      return;
    }
    reset();
    setManualMode(false);
    const rec = new SR();
    recognitionRef.current = rec;
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = (e: any) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript;
        else interimText += r[0].transcript;
      }
      setInterim(interimText);
      setTranscript(finalRef.current);
    };
    rec.onerror = (e: any) => {
      setListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        toast({ title: "Microphone blocked", description: "Please allow microphone access in your browser settings, then try again.", variant: "destructive" });
        setManualMode(true);
      } else if (e.error === "no-speech") {
        toast({ title: "No speech detected", description: "Tap the mic and try speaking again." });
      } else if (e.error !== "aborted") {
        toast({ title: "Voice error", description: "Could not capture audio. You can type the command instead.", variant: "destructive" });
      }
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      const text = finalRef.current.trim();
      if (text) processTranscript(text);
    };

    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
      setManualMode(true);
    }
  };

  const stopListening = () => {
    try { recognitionRef.current?.stop(); } catch { /* */ }
    setListening(false);
  };

  const handleOpen = () => {
    setOpen(true);
    reset();
    if (speechSupported && window.isSecureContext) {
      setTimeout(startListening, 300);
    } else {
      setManualMode(true);
    }
  };

  const processTranscript = useCallback(async (text: string) => {
    setProcessing(true);
    setTranscript(text);
    try {
      const { data, error } = await supabase.functions.invoke("voice-sale-parser", {
        body: {
          transcript: text,
          products: products.map(p => ({ id: p.id, name: p.name, price: p.selling_price, stock: p.stock })),
          customers: customers.map(c => ({ id: c.id, name: c.name })),
        },
      });
      if (error) throw new Error(error.message || "Failed to process command");
      if (data?.error) throw new Error(data.error);

      const parsed = data as ParsedResult;
      const resolved: ResolvedVoiceItem[] = [];
      const needsChoice: { item: ParsedItem; candidates: VoiceProduct[] }[] = [];
      const notFound: string[] = [];

      for (const item of parsed.items || []) {
        const direct = item.product_id ? products.find(p => p.id === item.product_id) : null;
        if (direct) {
          resolved.push({ product: direct, quantity: item.quantity, unitPrice: item.unit_price });
        } else if (item.candidate_ids?.length) {
          const candidates = item.candidate_ids
            .map(id => products.find(p => p.id === id))
            .filter(Boolean) as VoiceProduct[];
          if (candidates.length === 1) {
            resolved.push({ product: candidates[0], quantity: item.quantity, unitPrice: item.unit_price });
          } else if (candidates.length > 1) {
            needsChoice.push({ item, candidates });
          } else {
            notFound.push(item.query);
          }
        } else {
          notFound.push(item.query);
        }
      }

      if (notFound.length) {
        toast({ title: "Product not found", description: notFound.join(", "), variant: "destructive" });
        speak(`Product not found: ${notFound.join(", ")}`);
      }

      setResolvedItems(resolved);
      setPendingParsed(parsed);

      if (needsChoice.length > 0) {
        setAmbiguous(needsChoice);
        speak("Which product did you mean?");
      } else {
        buildReview(parsed, resolved, text);
      }
    } catch (err: any) {
      toast({ title: "Voice command failed", description: err.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  }, [products, customers]);

  // Resolve customer locally against the customer list
  const resolveCustomer = (parsed: ParsedResult): { id: string | null; name: string } | null => {
    if (!parsed.customer) return null;
    if (parsed.customer.customer_id) {
      const found = customers.find(c => c.id === parsed.customer!.customer_id);
      if (found) return { id: found.id, name: found.name };
    }
    const q = (parsed.customer.query || "").trim();
    if (!q) return null;
    const matches = customers.filter(c => c.name.toLowerCase().includes(q.toLowerCase()));
    if (matches.length === 1) return { id: matches[0].id, name: matches[0].name };
    return { id: null, name: q }; // new customer (created on completion)
  };

  const buildReview = (parsed: ParsedResult, items: ResolvedVoiceItem[], text: string) => {
    const priceUpdates = (parsed.price_updates || []).length > 0;

    if (items.length === 0 && !parsed.discount && !priceUpdates) {
      toast({ title: "Nothing to apply", description: "No recognizable products or actions in the command.", variant: "destructive" });
      speak("I couldn't find any products in that command. Please try again.");
      return;
    }

    // Price-update-only commands go straight to the draft handler
    if (items.length === 0 && priceUpdates) {
      applyDraftOnly(parsed, items, text);
      return;
    }

    const data: VoiceCompleteData = {
      transcript: text,
      items,
      discount: parsed.discount,
      customer: resolveCustomer(parsed),
      payment: parsed.payment,
      receiptAction: parsed.receipt_action,
      summary: parsed.summary,
    };
    setReview(data);
    reviewRef.current = data;

    // Speak-back summary with totals + change, then listen for confirmation
    const subtotal = items.reduce((s, it) => s + (it.unitPrice ?? defaultPrice(it.product)) * it.quantity, 0);
    let discountAmt = 0;
    if (parsed.discount) {
      discountAmt = parsed.discount.kind === "percentage"
        ? (subtotal * parsed.discount.value) / 100
        : Math.min(parsed.discount.value, subtotal);
    }
    const total = subtotal - discountAmt;
    const itemPhrases = items.map(it => `${it.quantity} ${it.product.name} at ${fmt(it.unitPrice ?? defaultPrice(it.product))} each`);
    let spoken = itemPhrases.join(", ") + ".";
    if (discountAmt > 0) spoken += ` Discount of ${fmt(discountAmt)} applied.`;
    spoken += ` Total amount is ${fmt(total)}.`;
    if (data.customer) spoken += ` Customer is ${data.customer.name}.`;
    if (data.payment?.amount) {
      spoken += ` Customer paid ${fmt(data.payment.amount)} ${methodLabel(data.payment.method)}.`;
      if (data.payment.amount >= total) spoken += ` Change is ${fmt(data.payment.amount - total)}.`;
      else spoken += ` Balance remaining is ${fmt(total - data.payment.amount)}.`;
    }
    spoken += " Would you like to complete the sale?";
    speak(spoken, () => startConfirmListening());
  };

  const defaultPrice = (p: VoiceProduct) => (p.selling_price > 0 ? p.selling_price : p.buying_price);

  const startConfirmListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR || !window.isSecureContext) return;
    if (!reviewRef.current) return;
    try {
      const rec = new SR();
      confirmRecRef.current = rec;
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.continuous = false;
      rec.onresult = (e: any) => {
        const heard = (e.results?.[0]?.[0]?.transcript || "").toLowerCase();
        if (/(confirm|complete|finish|yes|yeah|go ahead|sure|okay|ok)/.test(heard)) {
          handleCompleteSale();
        } else if (/(no|cancel|stop|wait)/.test(heard)) {
          speak("Sale not completed. You can review and confirm manually.");
        }
        setConfirmListening(false);
      };
      rec.onerror = () => setConfirmListening(false);
      rec.onend = () => setConfirmListening(false);
      rec.start();
      setConfirmListening(true);
    } catch { setConfirmListening(false); }
  };

  const handleCompleteSale = async () => {
    const data = reviewRef.current;
    if (!data || completing) return;
    try { confirmRecRef.current?.abort?.(); } catch { /* */ }
    setCompleting(true);
    try {
      const spoken = await onCompleteSale(data);
      if (typeof spoken === "string" && spoken) speak(spoken);
      setOpen(false);
      reset();
    } catch (err: any) {
      toast({ title: "Sale failed", description: err.message, variant: "destructive" });
    } finally {
      setCompleting(false);
    }
  };

  const handleAddToCartOnly = async () => {
    const data = reviewRef.current;
    const parsed = pendingParsed;
    if (!data || !parsed) return;
    try { confirmRecRef.current?.abort?.(); } catch { /* */ }
    await applyDraftOnly(parsed, data.items, data.transcript);
  };

  const applyDraftOnly = async (parsed: ParsedResult, items: ResolvedVoiceItem[], text: string) => {
    const priceUpdates = (parsed.price_updates || [])
      .map(u => {
        const product = products.find(p => p.id === u.product_id);
        return product ? { product, newPrice: u.new_price } : null;
      })
      .filter(Boolean) as { product: VoiceProduct; newPrice: number }[];

    if (items.length === 0 && !parsed.discount && priceUpdates.length === 0) {
      toast({ title: "Nothing to apply", description: "No recognizable products or actions in the command.", variant: "destructive" });
      setOpen(false);
      return;
    }

    const spoken = await onApply({
      transcript: text,
      items,
      discount: parsed.discount,
      priceUpdates,
      summary: parsed.summary,
    });
    speak(typeof spoken === "string" && spoken ? spoken : parsed.summary);
    setOpen(false);
    reset();
  };

  const chooseCandidate = (product: VoiceProduct) => {
    const [current, ...rest] = ambiguous;
    const newResolved = [...resolvedItems, { product, quantity: current.item.quantity, unitPrice: current.item.unit_price }];
    setResolvedItems(newResolved);
    setAmbiguous(rest);
    if (rest.length === 0 && pendingParsed) {
      buildReview(pendingParsed, newResolved, transcript);
    }
  };

  const skipCandidate = () => {
    const [, ...rest] = ambiguous;
    setAmbiguous(rest);
    if (rest.length === 0 && pendingParsed) {
      buildReview(pendingParsed, resolvedItems, transcript);
    }
  };

  const current = ambiguous[0];

  // Review totals for display
  const reviewSubtotal = review ? review.items.reduce((s, it) => s + (it.unitPrice ?? defaultPrice(it.product)) * it.quantity, 0) : 0;
  const reviewDiscount = review?.discount
    ? (review.discount.kind === "percentage" ? (reviewSubtotal * review.discount.value) / 100 : Math.min(review.discount.value, reviewSubtotal))
    : 0;
  const reviewTotal = reviewSubtotal - reviewDiscount;
  const reviewPaid = review?.payment?.amount ?? null;
  const reviewChange = reviewPaid != null ? reviewPaid - reviewTotal : null;

  return (
    <>
      <Button
        type="button"
        variant="default"
        className="h-12 shrink-0 gap-2 px-3 sm:px-4 font-semibold"
        onClick={handleOpen}
        title="Speak Sale — complete a sale by voice"
      >
        <Mic className="h-5 w-5" />
        <span className="hidden xs:inline sm:inline">Speak Sale</span>
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!o) { stopListening(); try { window.speechSynthesis?.cancel(); } catch { /* */ } reset(); } setOpen(o); }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Volume2 className="h-5 w-5 text-primary" /> Speak Sale
            </DialogTitle>
            <DialogDescription>
              Try: "Sell two bags of rice at twenty-five thousand each to John, ten percent discount, customer paid sixty thousand cash."
            </DialogDescription>
          </DialogHeader>

          {current ? (
            <div className="space-y-3">
              <p className="font-medium">Which product did you mean by "{current.item.query}"?</p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {current.candidates.map(c => (
                  <Button key={c.id} variant="outline" className="w-full justify-between h-auto py-3" onClick={() => chooseCandidate(c)}>
                    <span className="truncate text-left">{c.name}</span>
                    <span className="text-primary font-semibold shrink-0 ml-2">UGX {c.selling_price.toLocaleString()}</span>
                  </Button>
                ))}
              </div>
              <Button variant="ghost" size="sm" className="w-full" onClick={skipCandidate}>Skip this item</Button>
            </div>
          ) : review ? (
            <div className="space-y-3">
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                {review.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between text-sm gap-2">
                    <span className="truncate">{it.quantity} × {it.product.name}
                      {it.unitPrice != null && <Badge variant="secondary" className="ml-1 text-[10px]">price set</Badge>}
                    </span>
                    <span className="font-medium shrink-0">{fmt((it.unitPrice ?? defaultPrice(it.product)) * it.quantity)}</span>
                  </div>
                ))}
                {reviewDiscount > 0 && (
                  <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                    <span>Discount{review.discount?.kind === "percentage" ? ` (${review.discount.value}%)` : ""}</span>
                    <span>-{fmt(reviewDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold border-t pt-2">
                  <span>Total</span><span className="text-primary">{fmt(reviewTotal)}</span>
                </div>
                {review.customer && (
                  <div className="flex justify-between text-sm items-center">
                    <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> Customer</span>
                    <span className="font-medium">{review.customer.name}{!review.customer.id && <Badge variant="outline" className="ml-1 text-[10px]">new</Badge>}</span>
                  </div>
                )}
                {review.payment && (
                  <>
                    <div className="flex justify-between text-sm items-center">
                      <span className="flex items-center gap-1"><Banknote className="h-3.5 w-3.5" /> Paid</span>
                      <span className="font-medium">{reviewPaid != null ? fmt(reviewPaid) : "—"} <Badge variant="secondary" className="ml-1 text-[10px]">{methodLabel(review.payment.method)}</Badge></span>
                    </div>
                    {reviewChange != null && reviewChange >= 0 && (
                      <div className="flex justify-between text-sm font-semibold text-green-600 dark:text-green-400">
                        <span>Change</span><span>{fmt(reviewChange)}</span>
                      </div>
                    )}
                    {reviewChange != null && reviewChange < 0 && (
                      <div className="flex justify-between text-sm font-semibold text-destructive">
                        <span>Balance due</span><span>{fmt(-reviewChange)}</span>
                      </div>
                    )}
                  </>
                )}
                {review.receiptAction && (
                  <p className="text-xs text-muted-foreground">Receipt will be {review.receiptAction === "print" ? "printed" : review.receiptAction === "download" ? "downloaded" : `sent by ${review.receiptAction}`} automatically.</p>
                )}
              </div>

              {confirmListening && (
                <p className="text-xs text-center text-primary animate-pulse">Listening for "Confirm sale" or "Yes"…</p>
              )}

              <Button className="w-full h-12 gap-2 font-semibold" onClick={handleCompleteSale} disabled={completing}>
                {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                {completing ? "Completing…" : "Complete Sale"}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="gap-1.5" onClick={handleAddToCartOnly} disabled={completing}>
                  <ShoppingCart className="h-4 w-4" /> Cart only
                </Button>
                <Button variant="ghost" className="text-muted-foreground" onClick={() => { try { window.speechSynthesis?.cancel(); } catch { /* */ } setOpen(false); reset(); }} disabled={completing}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {!manualMode && (
                <div className="flex flex-col items-center gap-3 py-2">
                  <button
                    type="button"
                    onClick={listening ? stopListening : startListening}
                    disabled={processing}
                    className={`h-20 w-20 rounded-full flex items-center justify-center transition-all border-4
                      ${listening ? "bg-destructive text-destructive-foreground border-destructive/30 animate-pulse" : "bg-primary text-primary-foreground border-primary/30"}
                      ${processing ? "opacity-50" : "active:scale-95"}`}
                  >
                    {processing ? <Loader2 className="h-8 w-8 animate-spin" /> : listening ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
                  </button>
                  <p className="text-sm text-muted-foreground">
                    {processing ? "Processing command…" : listening ? "Listening… tap to stop" : "Tap to speak"}
                  </p>
                </div>
              )}

              {(transcript || interim) && (
                <div className="bg-muted rounded-lg p-3 text-sm">
                  <span>{transcript}</span>
                  <span className="text-muted-foreground italic">{interim}</span>
                </div>
              )}

              {manualMode ? (
                <div className="space-y-2">
                  <Input
                    placeholder='e.g. "Sell 2 bags of rice to John, paid 60000 cash"'
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && manualText.trim() && !processing) processTranscript(manualText.trim()); }}
                    className="h-12"
                  />
                  <Button className="w-full" disabled={!manualText.trim() || processing} onClick={() => processTranscript(manualText.trim())}>
                    {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Process Command
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" className="w-full gap-2" onClick={() => { stopListening(); setManualMode(true); }}>
                  <Keyboard className="h-4 w-4" /> Type instead
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
