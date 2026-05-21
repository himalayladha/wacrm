import type { WhatsAppReplyButton } from '@/types'

export const MAX_REPLY_BUTTONS = 3

export function normalizeReplyButtons(input: unknown): WhatsAppReplyButton[] {
  if (!Array.isArray(input)) return []

  return input
    .map((candidate) => {
      const raw = candidate as { id?: unknown; title?: unknown }
      return {
        id: String(raw?.id ?? '').trim(),
        title: String(raw?.title ?? '').trim(),
      }
    })
    .filter((button) => button.id.length > 0 && button.title.length > 0)
}

export function validateReplyButtons(input: unknown): string[] {
  if (input == null) return []
  if (!Array.isArray(input)) return ['reply buttons must be an array']
  if (input.length > MAX_REPLY_BUTTONS) {
    return [`you can attach up to ${MAX_REPLY_BUTTONS} reply buttons`]
  }

  const buttons = input.map((candidate) => {
    const raw = candidate as { id?: unknown; title?: unknown }
    return {
      id: String(raw?.id ?? '').trim(),
      title: String(raw?.title ?? '').trim(),
    }
  })

  for (let i = 0; i < buttons.length; i++) {
    if (!buttons[i].id) return [`reply button ${i + 1} needs an id`]
    if (!buttons[i].title) return [`reply button ${i + 1} needs a title`]
  }

  const ids = buttons.map((button) => button.id)
  if (new Set(ids).size !== ids.length) {
    return ['reply button ids must be unique']
  }

  return []
}
