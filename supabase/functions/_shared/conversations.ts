// Shared helpers for WhatsApp conversation threading (used by whatsapp-send and whatsapp-status).
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = String(input).trim().replace(/[\s\-()]/g, "");
  const digits = s.replace(/\D/g, "");
  if (s.startsWith("+")) {
    if (digits.length < 8 || digits.length > 15) return null;
    return "+" + digits;
  }
  if (digits.length === 10 && digits.startsWith("0")) return "+256" + digits.slice(1);
  if (digits.length >= 8 && digits.length <= 15) return "+" + digits;
  return null;
}

export function previewOf(body: string | null | undefined, mediaKind?: string | null): string {
  if (body && body.trim()) return body.trim().slice(0, 120);
  if (mediaKind) return `[${mediaKind}]`;
  return "";
}

export interface ConversationRow {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  phone: string;
  is_blocked: boolean;
  greeted_at: string | null;
  last_auto_reply_at: string | null;
}

/** Finds or creates the conversation thread for a phone number within a tenant. */
export async function getOrCreateConversation(
  db: SupabaseClient,
  tenantId: string,
  phone: string,
  opts: { displayName?: string | null; customerId?: string | null } = {},
): Promise<ConversationRow | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const { data: existing } = await db
    .from("whatsapp_conversations")
    .select("id, tenant_id, customer_id, phone, is_blocked, greeted_at, last_auto_reply_at")
    .eq("tenant_id", tenantId)
    .eq("phone", normalized)
    .maybeSingle();
  if (existing) {
    if (!existing.customer_id && opts.customerId) {
      await db.from("whatsapp_conversations").update({ customer_id: opts.customerId }).eq("id", existing.id);
      existing.customer_id = opts.customerId;
    }
    return existing as ConversationRow;
  }

  const { data: created, error } = await db
    .from("whatsapp_conversations")
    .insert({
      tenant_id: tenantId,
      phone: normalized,
      customer_id: opts.customerId ?? null,
      display_name: opts.displayName ?? null,
    })
    .select("id, tenant_id, customer_id, phone, is_blocked, greeted_at, last_auto_reply_at")
    .single();
  if (error) {
    // Unique race — re-read.
    const { data: retry } = await db
      .from("whatsapp_conversations")
      .select("id, tenant_id, customer_id, phone, is_blocked, greeted_at, last_auto_reply_at")
      .eq("tenant_id", tenantId).eq("phone", normalized).maybeSingle();
    return (retry as ConversationRow) ?? null;
  }
  return created as ConversationRow;
}

/** Updates the thread summary shown in the conversation list. */
export async function touchConversation(
  db: SupabaseClient,
  conversationId: string,
  args: { preview: string; direction: "in" | "out"; incrementUnread?: boolean },
) {
  const patch: Record<string, unknown> = {
    last_message_at: new Date().toISOString(),
    last_message_preview: args.preview,
    last_message_direction: args.direction,
  };
  if (args.incrementUnread) {
    const { data } = await db.from("whatsapp_conversations").select("unread_count").eq("id", conversationId).maybeSingle();
    patch.unread_count = ((data?.unread_count as number) ?? 0) + 1;
  }
  await db.from("whatsapp_conversations").update(patch).eq("id", conversationId);
}
