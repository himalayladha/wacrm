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
  buttons?: unknown
  [key: string]: unknown
}

type InsertRunner<T> = (payload: Record<string, unknown>) => Promise<InsertResult<T>>

const OPTIONAL_MESSAGE_COLUMNS = [
  {
    column: 'reply_to_message_id',
    migration: 'supabase/migrations/009_message_actions.sql',
    feature: 'reply linkage',
  },
  {
    column: 'buttons',
    migration: 'supabase/migrations/010_message_buttons.sql',
    feature: 'interactive message buttons',
  },
] as const

export function isMissingMessageColumnError(
  error: unknown,
  column: (typeof OPTIONAL_MESSAGE_COLUMNS)[number]['column'],
): boolean {
  const candidate = error as PostgrestLikeError | null
  if (!candidate) return false

  const combined = [candidate.message, candidate.details, candidate.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  if (candidate.code === "PGRST204" || candidate.code === "42703") {
    return combined.includes(column) || combined.length === 0
  }

  return (
    combined.includes(column) &&
    (
      combined.includes("schema cache") ||
      combined.includes("column") ||
      combined.includes("does not exist")
    )
  )
}

export function isMissingReplyLinkColumnError(error: unknown): boolean {
  return isMissingMessageColumnError(error, 'reply_to_message_id')
}

export function isMissingButtonsColumnError(error: unknown): boolean {
  return isMissingMessageColumnError(error, 'buttons')
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
export async function insertMessageWithOptionalFieldsFallback<T>(
  runInsert: InsertRunner<T>,
  payload: InsertPayload,
  source: "send" | "webhook" | "automation",
): Promise<InsertResult<T>> {
  const nextPayload: Record<string, unknown> = { ...payload }

  while (true) {
    const attempt = await runInsert({ ...nextPayload })
    if (!attempt.error) return attempt

    const missing = OPTIONAL_MESSAGE_COLUMNS.find(
      ({ column }) =>
        Object.prototype.hasOwnProperty.call(nextPayload, column) &&
        isMissingMessageColumnError(attempt.error, column),
    )

    if (!missing) return attempt

    console.warn(
      `[whatsapp/${source}] messages.${missing.column} is missing; ` +
        `retrying insert without ${missing.feature}. Apply ` +
        `${missing.migration} to enable it.`,
    )

    delete nextPayload[missing.column]
  }
}

export async function insertMessageWithReplyFallback<T>(
  runInsert: InsertRunner<T>,
  payload: InsertPayload,
  source: "send" | "webhook" | "automation",
): Promise<InsertResult<T>> {
  return insertMessageWithOptionalFieldsFallback(runInsert, payload, source)
}
