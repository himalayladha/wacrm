import { describe, expect, it, vi } from "vitest"

import {
  insertMessageWithReplyFallback,
  isMissingReplyLinkColumnError,
} from "./message-persistence"

describe("isMissingReplyLinkColumnError", () => {
  it("detects a PostgREST schema-cache miss for reply_to_message_id", () => {
    expect(
      isMissingReplyLinkColumnError({
        code: "PGRST204",
        message:
          "Could not find the 'reply_to_message_id' column of 'messages' in the schema cache",
      }),
    ).toBe(true)
  })

  it("detects a direct Postgres missing-column error", () => {
    expect(
      isMissingReplyLinkColumnError({
        code: "42703",
        message: 'column "reply_to_message_id" does not exist',
      }),
    ).toBe(true)
  })

  it("ignores unrelated errors", () => {
    expect(
      isMissingReplyLinkColumnError({
        code: "23505",
        message: "duplicate key value violates unique constraint",
      }),
    ).toBe(false)
  })
})

describe("insertMessageWithReplyFallback", () => {
  it("retries without reply_to_message_id when the column is missing", async () => {
    const runInsert = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: "PGRST204",
          message:
            "Could not find the 'reply_to_message_id' column of 'messages' in the schema cache",
        },
      })
      .mockResolvedValueOnce({
        data: { id: "msg-1" },
        error: null,
      })

    const result = await insertMessageWithReplyFallback(
      runInsert,
      {
        conversation_id: "conv-1",
        sender_type: "customer",
        content_type: "text",
        reply_to_message_id: null,
      },
      "webhook",
    )

    expect(result).toEqual({
      data: { id: "msg-1" },
      error: null,
    })
    expect(runInsert).toHaveBeenCalledTimes(2)
    expect(runInsert).toHaveBeenNthCalledWith(1, {
      conversation_id: "conv-1",
      sender_type: "customer",
      content_type: "text",
      reply_to_message_id: null,
    })
    expect(runInsert).toHaveBeenNthCalledWith(2, {
      conversation_id: "conv-1",
      sender_type: "customer",
      content_type: "text",
    })
  })

  it("does not retry when the error is unrelated", async () => {
    const runInsert = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "23505",
        message: "duplicate key value violates unique constraint",
      },
    })

    const result = await insertMessageWithReplyFallback(
      runInsert,
      {
        conversation_id: "conv-1",
        sender_type: "customer",
        content_type: "text",
        reply_to_message_id: null,
      },
      "webhook",
    )

    expect(result.error?.code).toBe("23505")
    expect(runInsert).toHaveBeenCalledTimes(1)
  })
})
