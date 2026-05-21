interface PostgrestLikeError {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

interface InsertResult<T> {
  data?: T | null
  error: PostgrestLikeError | null
}

interface InsertPayload {
  reply_to_message_id?: string | null
  [key: string]: unknown
}

type InsertRunner<T> = (payload: Record<string, unknown>) => Promise<InsertResult<T>>

export function isMissingReplyLinkColumnError(error: unknown): boolean {
  const candidate = error as PostgrestLikeError | null
  if (!candidate) return false

  const combined = [candidate.message, candidate.details, candidate.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  if (candidate.code === "PGRST204" || candidate.code === "42703") {
    return combined.includes("reply_to_message_id") || combined.length === 0
  }

  return (
    combined.includes("reply_to_message_id") &&
    (
      combined.includes("schema cache") ||
      combined.includes("column") ||
      combined.includes("does not exist")
    )
  )
}

/**
 * Migration 009 adds messages.reply_to_message_id. Self-hosters who pull
 * the app update before running that SQL would otherwise break *all*
 * message inserts, because PostgREST rejects payloads containing unknown
 * columns even when the value is null.
 *
 * To keep chats flowing, retry once without the reply linkage when we
 * detect the column is missing. Quoted-reply UI degrades gracefully
 * until the migration is applied.
 */
export async function insertMessageWithReplyFallback<T>(
  runInsert: InsertRunner<T>,
  payload: InsertPayload,
  source: "send" | "webhook",
): Promise<InsertResult<T>> {
  const firstAttempt = await runInsert(payload)

  if (
    !firstAttempt.error ||
    !Object.prototype.hasOwnProperty.call(payload, "reply_to_message_id") ||
    !isMissingReplyLinkColumnError(firstAttempt.error)
  ) {
    return firstAttempt
  }

  console.warn(
    `[whatsapp/${source}] messages.reply_to_message_id is missing; ` +
      `retrying insert without reply linkage. Apply ` +
      `supabase/migrations/009_message_actions.sql to enable replies.`,
  )

  const legacyPayload = { ...payload }
  delete legacyPayload.reply_to_message_id
  return runInsert(legacyPayload)
}
