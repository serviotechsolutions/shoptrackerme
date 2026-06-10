import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Mic, MicOff, Loader2, Volume2, Keyboard } from "lucide-react";
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
  summary: string;
}

interface VoiceSaleProps {
  products: VoiceProduct[];
  onApply: (result: VoiceApplyResult) => Promise<string | void>;
}

const speak = (text: string) => {
  try {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1;
      window.speechSynthesis.speak(utter);
    }
  } catch { /* ignore */ }
};

export const VoiceSale = ({ products, onApply }: VoiceSaleProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [manualText, setManualText] = useState("");
  const [ambiguous, setAmbiguous] = useState<{ item: ParsedItem; candidates: VoiceProduct[] }[]>([]);
  const [pendingParsed, setPendingParsed] = useState<ParsedResult | null>(null);
  const [resolvedItems, setResolvedItems] = useState<ResolvedVoiceItem[]>([]);
  const recognitionRef = useRef<any>(null);
  const finalRef = useRef("");

  const speechSupported = typeof window !== "undefined" &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  useEffect(() => () => { try { recognitionRef.current?.abort?.(); } catch { /* */ } }, []);

  const reset = () => {
    setTranscript(""); setInterim(""); setAmbiguous([]); setPendingParsed(null);
    setResolvedItems([]); setManualText(""); finalRef.current = "";
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
      // slight delay so dialog mounts before permission prompt
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
        await finalize(parsed, resolved);
      }
    } catch (err: any) {
      toast({ title: "Voice command failed", description: err.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  }, [products]);

  const finalize = async (parsed: ParsedResult, items: ResolvedVoiceItem[]) => {
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
      transcript,
      items,
      discount: parsed.discount,
      priceUpdates,
      summary: parsed.summary,
    });
    speak(typeof spoken === "string" && spoken ? spoken : parsed.summary);
    setOpen(false);
    reset();
  };

  const chooseCandidate = async (product: VoiceProduct) => {
    const [current, ...rest] = ambiguous;
    const newResolved = [...resolvedItems, { product, quantity: current.item.quantity, unitPrice: current.item.unit_price }];
    setResolvedItems(newResolved);
    setAmbiguous(rest);
    if (rest.length === 0 && pendingParsed) {
      await finalize(pendingParsed, newResolved);
    }
  };

  const skipCandidate = async () => {
    const [, ...rest] = ambiguous;
    setAmbiguous(rest);
    if (rest.length === 0 && pendingParsed) {
      await finalize(pendingParsed, resolvedItems);
    }
  };

  const current = ambiguous[0];

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-12 w-12 shrink-0"
        onClick={handleOpen}
        title="Speech-to-Sell (voice command)"
      >
        <Mic className="h-5 w-5 text-primary" />
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!o) { stopListening(); reset(); } setOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Volume2 className="h-5 w-5 text-primary" /> Speech-to-Sell
            </DialogTitle>
            <DialogDescription>
              Say things like "Sell two bags of rice at twenty-five thousand each" or "Give ten percent discount".
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
                    placeholder='e.g. "Sell 2 bags of rice at 25000 each"'
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
