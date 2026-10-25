import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sendWhatsapp, normalizePhone } from "@/lib/whatsapp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, Send, Search, Pin, Archive, Ban, Star, MoreVertical, ArrowLeft, User, Package,
  Paperclip, StickyNote, Check, CheckCheck, Clock, AlertCircle, MessageCircle, RefreshCw, Zap, FileText,
  Pencil, Trash2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Link } from "react-router-dom";
import SendDocumentDialog from "@/components/whatsapp/SendDocumentDialog";


interface Conversation {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  phone: string;
  display_name: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  last_message_direction: string;
  unread_count: number;
  is_pinned: boolean;
  is_archived: boolean;
  is_blocked: boolean;
  labels: any;
}

interface Message {
  id: string;
  conversation_id: string | null;
  direction: string;
  body: string | null;
  media_url: string | null;
  media_kind: string | null;
  media_filename: string | null;
  status: string;
  is_starred: boolean;
  message_type: string;
  error_message: string | null;
  error_code?: string | null;
  retries?: number | null;
  retry_of_message_id?: string | null;
  created_at: string;
  edited_at?: string | null;
  is_deleted?: boolean;
  deleted_at?: string | null;
}

interface QuickReply { id: string; shortcut: string; title: string; body: string }

const LABELS = ["New", "Order", "Payment", "Complaint", "Delivery", "VIP"];

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("") || "#";
}

function timeLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (d >= today) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (d >= yesterday) return "Yesterday";
  return d.toLocaleDateString();
}

function TickIcon({ status }: { status: string }) {
  if (status === "read") return <CheckCheck className="h-3.5 w-3.5 text-sky-500" />;
  if (status === "delivered") return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />;
  if (status === "sent") return <Check className="h-3.5 w-3.5 text-muted-foreground" />;
  if (status === "failed") return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
  return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
}

/** Resolves a stored media reference (storage path or absolute URL) into a viewable URL. */
function useMediaUrl(raw: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      if (!raw) { setUrl(null); return; }
      if (/^https?:\/\//.test(raw)) { setUrl(raw); return; }
      const { data } = await supabase.storage.from("whatsapp-media").createSignedUrl(raw, 60 * 60);
      if (active) setUrl(data?.signedUrl ?? null);
    })();
    return () => { active = false; };
  }, [raw]);
  return url;
}

function MediaBubble({ message }: { message: Message }) {
  const url = useMediaUrl(message.media_url);
  if (!message.media_url) return null;
  if (!url) return <div className="text-xs text-muted-foreground py-2">Loading attachment…</div>;
  if (message.media_kind === "image") {
    return <img src={url} alt={message.body || "Shared photo"} loading="lazy" className="rounded-md max-h-64 max-w-full object-contain w-auto mb-1" />;
  }
  if (message.media_kind === "video") {
    return <video src={url} controls className="rounded-md max-h-64 max-w-full mb-1" />;
  }
  if (message.media_kind === "audio") {
    return <audio src={url} controls className="mb-1 w-56 max-w-full" />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 underline text-sm mb-1 [overflow-wrap:anywhere]">
      <Paperclip className="h-4 w-4" />{message.media_filename || "Attachment"}
    </a>
  );
}

const CONV_PAGE = 30;
const MSG_PAGE = 40;

function mergeById<T extends { id: string }>(a: T[], b: T[]): T[] {
  const map = new Map<string, T>();
  [...a, ...b].forEach((row) => map.set(row.id, row));
  return Array.from(map.values());
}

export default function WhatsAppInbox({ initialConversationId }: { initialConversationId?: string | null }) {
  const { toast } = useToast();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(initialConversationId ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [noteBody, setNoteBody] = useState("");
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "archived">("all");
  const [convPage, setConvPage] = useState(0);
  const [hasMoreConvs, setHasMoreConvs] = useState(true);
  const [loadingMoreConvs, setLoadingMoreConvs] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [customer, setCustomer] = useState<any | null>(null);
  const [customerStats, setCustomerStats] = useState<{ orders: number; spent: number } | null>(null);
  const [productPicker, setProductPicker] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState("");
  const [docDialog, setDocDialog] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editBody, setEditBody] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingMessage, setDeletingMessage] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef(0);

  const active = useMemo(() => conversations.find((c) => c.id === activeId) || null, [conversations, activeId]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const sortConversations = (rows: Conversation[]) =>
    [...rows].sort((a, b) =>
      Number(b.is_pinned) - Number(a.is_pinned) ||
      new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());

  /** Server-side paginated conversation query — keeps the inbox fast with thousands of chats. */
  const fetchConversationPage = useCallback(async (page: number) => {
    let q = supabase.from("whatsapp_conversations").select("*");
    q = filter === "archived" ? q.eq("is_archived", true) : q.eq("is_archived", false);
    if (filter === "unread") q = q.gt("unread_count", 0);
    const term = debouncedSearch.replace(/[%,]/g, "");
    if (term) {
      q = q.or(`display_name.ilike.%${term}%,phone.ilike.%${term}%,last_message_preview.ilike.%${term}%`);
    }
    const { data } = await q
      .order("is_pinned", { ascending: false })
      .order("last_message_at", { ascending: false })
      .range(page * CONV_PAGE, page * CONV_PAGE + CONV_PAGE - 1);
    return (data || []) as Conversation[];
  }, [filter, debouncedSearch]);

  /** Reloads the first page and merges it with already-loaded pages (used by realtime). */
  const refreshConversations = useCallback(async () => {
    const first = await fetchConversationPage(0);
    setConversations((prev) => {
      if (pageRef.current === 0) return sortConversations(first);
      return sortConversations(mergeById(prev, first));
    });
    setLoading(false);
  }, [fetchConversationPage]);

  // Reset pagination whenever the filter or search term changes.
  useEffect(() => {
    let active = true;
    setLoading(true);
    pageRef.current = 0;
    setConvPage(0);
    fetchConversationPage(0).then((rows) => {
      if (!active) return;
      setConversations(sortConversations(rows));
      setHasMoreConvs(rows.length === CONV_PAGE);
      setLoading(false);
    });
    return () => { active = false; };
  }, [fetchConversationPage]);

  const loadMoreConversations = useCallback(async () => {
    if (loadingMoreConvs || !hasMoreConvs) return;
    setLoadingMoreConvs(true);
    const next = convPage + 1;
    const rows = await fetchConversationPage(next);
    setConversations((prev) => sortConversations(mergeById(prev, rows)));
    setHasMoreConvs(rows.length === CONV_PAGE);
    setConvPage(next);
    pageRef.current = next;
    setLoadingMoreConvs(false);
  }, [convPage, fetchConversationPage, hasMoreConvs, loadingMoreConvs]);

  const MESSAGE_COLUMNS =
    "id, conversation_id, direction, body, media_url, media_kind, media_filename, status, is_starred, message_type, error_message, error_code, retries, retry_of_message_id, created_at, edited_at, is_deleted, deleted_at";

  /** Loads the most recent page of a conversation; older messages load on demand. */
  const loadMessages = useCallback(async (conversationId: string) => {
    const { data } = await supabase.from("whatsapp_messages")
      .select(MESSAGE_COLUMNS)
      .eq("conversation_id", conversationId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(MSG_PAGE);
    const rows = ((data || []) as Message[]).slice().reverse();
    setMessages(rows);
    setHasOlderMessages((data || []).length === MSG_PAGE);
    const { data: n } = await supabase.from("whatsapp_notes")
      .select("*").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(50);
    setNotes(n || []);
  }, []);

  /** Merges only new/updated messages so the timeline doesn't reset while scrolled up. */
  const syncLatestMessages = useCallback(async (conversationId: string) => {
    const { data } = await supabase.from("whatsapp_messages")
      .select(MESSAGE_COLUMNS)
      .eq("conversation_id", conversationId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(MSG_PAGE);
    const fresh = ((data || []) as Message[]).slice().reverse();
    // Merge updates and drop messages deleted since the last sync (older loaded pages are kept).
    setMessages((prev) => {
      const freshIds = new Set(fresh.map((f) => f.id));
      const oldestFresh = fresh[0] ? new Date(fresh[0].created_at).getTime() : 0;
      const kept = prev.filter((p) => freshIds.has(p.id) || new Date(p.created_at).getTime() < oldestFresh);
      return mergeById(kept, fresh).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    });
  }, []);

  const loadOlderMessages = useCallback(async () => {
    if (!activeId || !messages.length || loadingOlder) return;
    setLoadingOlder(true);
    const oldest = messages[0].created_at;
    const { data } = await supabase.from("whatsapp_messages")
      .select(MESSAGE_COLUMNS)
      .eq("conversation_id", activeId)
      .eq("is_deleted", false)
      .lt("created_at", oldest)
      .order("created_at", { ascending: false })
      .limit(MSG_PAGE);
    const older = ((data || []) as Message[]).slice().reverse();
    setMessages((prev) => [...older, ...prev]);
    setHasOlderMessages((data || []).length === MSG_PAGE);
    setLoadingOlder(false);
  }, [activeId, messages, loadingOlder]);

  useEffect(() => {
    (async () => {
      const { data: prof } = await supabase.from("profiles").select("tenant_id").maybeSingle();
      setTenantId(prof?.tenant_id ?? null);
      const { data: qr } = await supabase.from("whatsapp_quick_replies").select("*").order("shortcut");
      setQuickReplies((qr || []) as QuickReply[]);
    })();
  }, []);

  // Realtime: conversations + messages
  useEffect(() => {
    const channel = supabase.channel("whatsapp-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_conversations" }, () => refreshConversations())
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_messages" }, (payload: any) => {
        const row = payload.new || payload.old;
        if (row?.conversation_id && row.conversation_id === activeId) syncLatestMessages(activeId);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeId, refreshConversations, syncLatestMessages]);

  // Open conversation
  useEffect(() => {
    if (!activeId) { setMessages([]); setNotes([]); setCustomer(null); return; }
    loadMessages(activeId);
    (async () => {
      await supabase.from("whatsapp_conversations").update({ unread_count: 0 }).eq("id", activeId);
      const conv = conversations.find((c) => c.id === activeId);
      if (conv?.customer_id) {
        const { data: cust } = await supabase.from("customers").select("*").eq("id", conv.customer_id).maybeSingle();
        setCustomer(cust);
        const { data: sales } = await supabase.from("sales").select("total_amount").eq("customer_id", conv.customer_id);
        setCustomerStats({
          orders: sales?.length || 0,
          spent: (sales || []).reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0),
        });
      } else { setCustomer(null); setCustomerStats(null); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, loadMessages]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const filteredConversations = conversations;


  const patchConversation = async (id: string, patch: Partial<Conversation>) => {
    await supabase.from("whatsapp_conversations").update(patch as any).eq("id", id);
    refreshConversations();
  };

  const send = async (body?: string, media?: { url: string; kind: "image" | "document" }) => {
    if (!active) return;
    const text = (body ?? draft).trim();
    if (!text && !media) return;
    if (active.is_blocked) { toast({ title: "Contact blocked", description: "Unblock to send messages.", variant: "destructive" }); return; }
    setSending(true);
    try {
      await sendWhatsapp({
        to: active.phone,
        body: text || undefined,
        media_url: media?.url,
        media_kind: media?.kind ?? null,
        message_type: "custom",
        customer_id: active.customer_id,
      });
      setDraft("");
      await loadMessages(active.id);
      await refreshConversations();
    } catch (e) {
      toast({ title: "Send failed", description: (e as Error).message, variant: "destructive" });
    } finally { setSending(false); }
  };

  /** Resends a failed outgoing message. The original row is kept and linked for the audit trail. */
  const retryMessage = async (m: Message) => {
    if (!active) return;
    setRetryingId(m.id);
    try {
      await sendWhatsapp({
        to: active.phone,
        body: m.body || undefined,
        media_url: m.media_url || undefined,
        media_kind: (m.media_kind as any) ?? null,
        media_filename: m.media_filename,
        message_type: (m.message_type as any) || "custom",
        customer_id: active.customer_id,
        retry_of_message_id: m.id,
      });
      toast({ title: "Message resent", description: "A new attempt was queued and linked to the failed message." });
      await loadMessages(active.id);
      await refreshConversations();
    } catch (e) {
      toast({ title: "Retry failed", description: (e as Error).message, variant: "destructive" });
      await loadMessages(active.id);
    } finally { setRetryingId(null); }
  };


  const startNewChat = async () => {
    const phone = normalizePhone(newChatPhone);
    if (!phone || !tenantId) { toast({ title: "Invalid phone", variant: "destructive" }); return; }
    const { data: existing } = await supabase.from("whatsapp_conversations")
      .select("id").eq("tenant_id", tenantId).eq("phone", phone).maybeSingle();
    let id = existing?.id;
    if (!id) {
      const { data, error } = await supabase.from("whatsapp_conversations")
        .insert({ tenant_id: tenantId, phone }).select("id").single();
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      id = data.id;
    }
    setNewChatOpen(false); setNewChatPhone("");
    await refreshConversations();
    setActiveId(id!);
  };

  const openProductPicker = async () => {
    setProductPicker(true);
    const { data } = await supabase.from("products").select("id, name, selling_price, image_url, stock").order("name").limit(300);
    setProducts(data || []);
  };

  const shareProduct = async (p: any) => {
    const price = `UGX ${Number(p.selling_price || 0).toLocaleString()}`;
    const body = `*${p.name}*\nPrice: ${price}\n${p.stock > 0 ? "In stock" : "Out of stock"}`;
    setProductPicker(false);
    if (p.image_url) await send(body, { url: p.image_url, kind: "image" });
    else await send(body);
  };

  const addNote = async () => {
    if (!active || !noteBody.trim() || !tenantId) return;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("whatsapp_notes").insert({
      tenant_id: tenantId, conversation_id: active.id, body: noteBody.trim(), author_id: user?.id ?? null,
    });
    setNoteBody("");
    loadMessages(active.id);
  };

  const toggleStar = async (m: Message) => {
    await supabase.from("whatsapp_messages").update({ is_starred: !m.is_starred }).eq("id", m.id);
    if (active) loadMessages(active.id);
  };

  /** Edits the shop's own record of a sent message. WhatsApp cannot change what was already delivered. */
  const saveEdit = async () => {
    if (!editingMessage || !active) return;
    const text = editBody.trim();
    if (!text || text === editingMessage.body) { setEditingMessage(null); return; }
    if (Date.now() - new Date(editingMessage.created_at).getTime() >= 60_000) {
      toast({ title: "Edit time expired", description: "Messages can only be edited within 1 minute of sending.", variant: "destructive" });
      setEditingMessage(null);
      return;
    }
    setSavingEdit(true);
    const { error } = await supabase.from("whatsapp_messages")
      .update({ body: text, edited_at: new Date().toISOString() })
      .eq("id", editingMessage.id);
    setSavingEdit(false);
    if (error) { toast({ title: "Edit failed", description: error.message, variant: "destructive" }); return; }
    setEditingMessage(null);
    await loadMessages(active.id);
    await refreshConversations();
  };

  /** Soft-deletes a message from the inbox view; the row stays in the database for the audit trail. */
  const confirmDelete = async () => {
    if (!deletingMessage || !active) return;
    setDeleting(true);
    const { error } = await supabase.from("whatsapp_messages")
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq("id", deletingMessage.id);
    setDeleting(false);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    const wasLast = messages[messages.length - 1]?.id === deletingMessage.id;
    setDeletingMessage(null);
    if (wasLast) {
      await supabase.from("whatsapp_conversations")
        .update({ last_message_preview: "Message deleted" })
        .eq("id", active.id);
    }
    await loadMessages(active.id);
    await refreshConversations();
  };

  const toggleLabel = async (label: string) => {
    if (!active) return;
    const current: string[] = Array.isArray(active.labels) ? active.labels : [];
    const next = current.includes(label) ? current.filter((l) => l !== label) : [...current, label];
    await patchConversation(active.id, { labels: next as any });
  };

  // Quick reply shortcut expansion: "/thanks "
  const onDraftChange = (value: string) => {
    const match = value.match(/^\/(\w+)\s$/);
    if (match) {
      const qr = quickReplies.find((q) => q.shortcut.replace(/^\//, "") === match[1]);
      if (qr) { setDraft(qr.body); return; }
    }
    setDraft(value);
  };

  const labels: string[] = Array.isArray(active?.labels) ? (active!.labels as string[]) : [];

  return (
    <div className="grid min-w-0 grid-cols-1 md:grid-cols-[minmax(13rem,28%)_minmax(0,1fr)] xl:grid-cols-[minmax(13rem,25%)_minmax(0,1fr)_minmax(14rem,23%)] gap-3 h-[max(20rem,calc(100dvh-16rem))] md:min-h-[420px]">
      {/* Conversation list */}
      <Card className={`overflow-hidden flex flex-col ${activeId ? "hidden md:flex" : "flex"}`}>
        <div className="p-3 space-y-2 border-b">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search chats" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button size="icon" variant="outline" onClick={() => setNewChatOpen(true)} aria-label="New chat">
              <MessageCircle className="h-4 w-4" />
            </Button>
          </div>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
            <TabsList className="w-full grid grid-cols-3 h-8">
              <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
              <TabsTrigger value="unread" className="text-xs">Unread</TabsTrigger>
              <TabsTrigger value="archived" className="text-xs">Archived</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <ScrollArea className="flex-1">
          {loading && <div className="p-4 flex justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div>}
          {!loading && filteredConversations.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground text-center">No conversations yet.</p>
          )}
          {filteredConversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={`w-full text-left px-3 py-2.5 border-b hover:bg-muted/60 transition-colors ${activeId === c.id ? "bg-muted" : ""}`}
            >
              <div className="flex items-start gap-2">
                <Avatar className="h-9 w-9"><AvatarFallback className="text-xs">{initials(c.display_name || c.phone)}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-sm truncate flex-1">{c.display_name || c.phone}</span>
                    {c.is_pinned && <Pin className="h-3 w-3 text-muted-foreground" />}
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{timeLabel(c.last_message_at)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground truncate flex-1">
                      {c.last_message_direction === "out" ? "You: " : ""}{c.last_message_preview || "—"}
                    </span>
                    {c.unread_count > 0 && <Badge className="h-5 min-w-5 justify-center px-1.5 text-[10px]">{c.unread_count}</Badge>}
                  </div>
                </div>
              </div>
            </button>
          ))}
          {!loading && hasMoreConvs && (
            <div className="p-2">
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={loadMoreConversations} disabled={loadingMoreConvs}>
                {loadingMoreConvs ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                Load more chats
              </Button>
            </div>
          )}
        </ScrollArea>

      </Card>

      {/* Chat panel */}
      <Card className={`overflow-hidden flex flex-col ${activeId ? "flex" : "hidden md:flex"}`}>
        {!active ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2 p-6 text-center">
            <MessageCircle className="h-10 w-10 opacity-40" />
            <p className="text-sm">Select a conversation to start chatting.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 p-3 border-b">
              <Button size="icon" variant="ghost" className="md:hidden" onClick={() => setActiveId(null)} aria-label="Back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Avatar className="h-9 w-9"><AvatarFallback className="text-xs">{initials(active.display_name || active.phone)}</AvatarFallback></Avatar>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm truncate">{active.display_name || active.phone}</div>
                <div className="text-xs text-muted-foreground truncate">{active.phone}{active.is_blocked ? " • Blocked" : ""}</div>
              </div>
              <Button size="icon" variant="ghost" className="xl:hidden" onClick={() => setShowProfile(true)} aria-label="Contact info">
                <User className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label="Chat options"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => patchConversation(active.id, { is_pinned: !active.is_pinned })}>
                    <Pin className="mr-2 h-4 w-4" />{active.is_pinned ? "Unpin" : "Pin"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => patchConversation(active.id, { is_archived: !active.is_archived })}>
                    <Archive className="mr-2 h-4 w-4" />{active.is_archived ? "Unarchive" : "Archive"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => patchConversation(active.id, { unread_count: 1 })}>
                    <MessageCircle className="mr-2 h-4 w-4" />Mark as unread
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => patchConversation(active.id, { is_blocked: !active.is_blocked })}>
                    <Ban className="mr-2 h-4 w-4" />{active.is_blocked ? "Unblock" : "Block"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {LABELS.map((l) => (
                    <DropdownMenuItem key={l} onClick={() => toggleLabel(l)}>
                      <span className="mr-2">{labels.includes(l) ? "✓" : ""}</span>{l}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {labels.length > 0 && (
              <div className="flex gap-1 flex-wrap px-3 py-2 border-b">
                {labels.map((l) => <Badge key={l} variant="secondary" className="text-[10px]">{l}</Badge>)}
              </div>
            )}

            <ScrollArea className="flex-1 p-3 bg-muted/30">
              <div className="space-y-2">
                {hasOlderMessages && (
                  <div className="flex justify-center pb-1">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={loadOlderMessages} disabled={loadingOlder}>
                      {loadingOlder ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
                      Load earlier messages
                    </Button>
                  </div>
                )}
                {messages.map((m) => (
                  <div key={m.id} className={`group flex items-start gap-1 ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon" variant="ghost"
                          className={`h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity ${m.direction === "out" ? "order-2" : ""}`}
                          aria-label="Message actions"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align={m.direction === "out" ? "end" : "start"}>
                        <DropdownMenuItem onClick={() => toggleStar(m)}>
                          <Star className="mr-2 h-4 w-4" />{m.is_starred ? "Unstar" : "Star"}
                        </DropdownMenuItem>
                        {m.direction === "out" && m.body && !m.media_url && Date.now() - new Date(m.created_at).getTime() < 60_000 && (
                          <DropdownMenuItem onClick={() => { setEditingMessage(m); setEditBody(m.body || ""); }}>
                            <Pencil className="mr-2 h-4 w-4" />Edit
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeletingMessage(m)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <div
                      onDoubleClick={() => toggleStar(m)}
                      className={`min-w-0 max-w-[85%] sm:max-w-[80%] [overflow-wrap:anywhere] rounded-lg px-3 py-2 text-sm shadow-sm ${
                        m.direction === "out" ? "bg-primary text-primary-foreground" : "bg-card border"
                      }`}
                    >
                      <MediaBubble message={m} />
                      {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                      <div className={`flex flex-wrap items-center gap-1 justify-end mt-1 text-xs ${m.direction === "out" ? "opacity-80" : "text-muted-foreground"}`}>
                        {m.retry_of_message_id && <span className="opacity-80">resent</span>}
                        {m.edited_at && <span className="opacity-80 italic">edited</span>}
                        {m.is_starred && <Star className="h-3 w-3 fill-current" />}
                        <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        {m.direction === "out" && <TickIcon status={m.status} />}
                      </div>
                      {m.error_message && (
                        <p className="text-xs text-destructive mt-1">
                          {m.error_code ? `[${m.error_code}] ` : ""}{m.error_message}
                        </p>
                      )}
                      {m.direction === "out" && m.status === "failed" && (
                        <div className="mt-1 flex items-center gap-2">
                          <Button
                            size="sm" variant="secondary" className="h-6 text-[11px]"
                            onClick={() => retryMessage(m)} disabled={retryingId === m.id}
                          >
                            {retryingId === m.id
                              ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              : <RefreshCw className="mr-1 h-3 w-3" />}
                            Retry
                          </Button>
                          {!!m.retries && <span className="text-xs opacity-80">{m.retries} attempt{m.retries > 1 ? "s" : ""}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>


            <div className="p-3 border-t space-y-2">
              {quickReplies.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {quickReplies.slice(0, 6).map((q) => (
                    <Button key={q.id} size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDraft(q.body)}>
                      <Zap className="mr-1 h-3 w-3" />{q.title}
                    </Button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <Button size="icon" variant="outline" onClick={openProductPicker} aria-label="Share product"><Package className="h-4 w-4" /></Button>
                <Button size="icon" variant="outline" onClick={() => setDocDialog(true)} aria-label="Attach document"><FileText className="h-4 w-4" /></Button>

                <Textarea
                  value={draft}
                  onChange={(e) => onDraftChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Type a message… (/shortcut for quick replies)"
                  rows={1}
                  className="order-first basis-full sm:order-none sm:basis-auto sm:flex-1 min-w-0 min-h-11 max-h-32 resize-none"
                />
                <Button onClick={() => send()} disabled={sending} size="icon" aria-label="Send">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Contact panel (desktop) */}
      <Card className="hidden xl:flex flex-col overflow-hidden">
        <ContactPanel
          active={active} customer={customer} stats={customerStats}
          notes={notes} noteBody={noteBody} setNoteBody={setNoteBody} addNote={addNote}
        />
      </Card>

      {/* Contact panel (mobile dialog) */}
      <Dialog open={showProfile} onOpenChange={setShowProfile}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Contact details</DialogTitle></DialogHeader>
          <ContactPanel
            active={active} customer={customer} stats={customerStats}
            notes={notes} noteBody={noteBody} setNoteBody={setNoteBody} addNote={addNote}
          />
        </DialogContent>
      </Dialog>

      {/* New chat */}
      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Start a new chat</DialogTitle>
            <DialogDescription>Enter a WhatsApp number to open a conversation.</DialogDescription>
          </DialogHeader>
          <Input value={newChatPhone} onChange={(e) => setNewChatPhone(e.target.value)} placeholder="+256700000000" />
          <Button onClick={startNewChat}>Open chat</Button>
        </DialogContent>
      </Dialog>

      {active && (
        <SendDocumentDialog
          open={docDialog}
          onOpenChange={setDocDialog}
          tenantId={tenantId}
          phone={active.phone}
          customerId={active.customer_id}
          onSent={() => { loadMessages(active.id); refreshConversations(); }}
        />
      )}

      {/* Edit message */}
      <Dialog open={!!editingMessage} onOpenChange={(open) => { if (!open) setEditingMessage(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit message</DialogTitle>
            <DialogDescription>
              This updates the message in your shop's chat record. WhatsApp cannot change the message already delivered to the customer's phone.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={4}
            className="resize-none"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingMessage(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={savingEdit || !editBody.trim()}>
              {savingEdit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete message */}
      <AlertDialog open={!!deletingMessage} onOpenChange={(open) => { if (!open) setDeletingMessage(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingMessage?.direction === "out"
                ? "It will be removed from this chat view. WhatsApp cannot remove it from the customer's phone if it was already delivered."
                : "It will be removed from this chat view."}
              {" "}The record is kept in your message history for auditing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Product picker */}

      <Dialog open={productPicker} onOpenChange={setProductPicker}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Share a product</DialogTitle>
            <DialogDescription>Sends the product name, price and photo to this customer.</DialogDescription>
          </DialogHeader>
          <Input placeholder="Search products" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
          <ScrollArea className="flex-1 max-h-[50vh]">
            {products
              .filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase()))
              .map((p) => (
                <button key={p.id} onClick={() => shareProduct(p)} className="w-full flex items-center gap-3 p-2 hover:bg-muted rounded-md text-left">
                  {p.image_url
                    ? <img src={p.image_url} alt={p.name} className="h-10 w-10 rounded object-cover" loading="lazy" />
                    : <div className="h-10 w-10 rounded bg-muted flex items-center justify-center"><Package className="h-4 w-4" /></div>}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">UGX {Number(p.selling_price || 0).toLocaleString()}</div>
                  </div>
                </button>
              ))}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContactPanel({ active, customer, stats, notes, noteBody, setNoteBody, addNote }: {
  active: Conversation | null; customer: any; stats: { orders: number; spent: number } | null;
  notes: any[]; noteBody: string; setNoteBody: (v: string) => void; addNote: () => void;
}) {
  if (!active) {
    return <div className="p-4 text-sm text-muted-foreground">No conversation selected.</div>;
  }
  return (
    <ScrollArea className="flex-1">
      <CardContent className="p-4 space-y-4">
        <div className="text-center space-y-1">
          <Avatar className="h-14 w-14 mx-auto"><AvatarFallback>{initials(active.display_name || active.phone)}</AvatarFallback></Avatar>
          <div className="font-medium">{active.display_name || active.phone}</div>
          <div className="text-xs text-muted-foreground">{active.phone}</div>
        </div>
        <Separator />
        {customer ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span>{customer.name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="capitalize">{customer.status}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Loyalty</span><span>{customer.loyalty_points} pts</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Orders</span><span>{stats?.orders ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total spent</span><span>UGX {(stats?.spent ?? 0).toLocaleString()}</span></div>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to={`/customers/${customer.id}`}>Open customer profile</Link>
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Not linked to a customer record.</p>
        )}
        <Separator />
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium"><StickyNote className="h-4 w-4" />Internal notes</div>
          <Textarea rows={2} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Visible to your team only" />
          <Button size="sm" variant="outline" className="w-full" onClick={addNote}>Add note</Button>
          <div className="space-y-2">
            {notes.map((n) => (
              <div key={n.id} className="text-xs bg-muted rounded-md p-2">
                <p className="whitespace-pre-wrap">{n.body}</p>
                <span className="text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </ScrollArea>
  );
}
