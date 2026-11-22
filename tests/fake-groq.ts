import { vi } from "vitest";
import { validRecord } from "./helpers";

export type FakeGroqReply = Response | (() => Response | Promise<Response>) | Error;

/**
 * A stand-in for api.groq.com. Answers transcription and chat requests from queues and records
 * what was sent, so tests can assert the request shape.
 */
export function fakeGroq(
  options: {
    transcription?: FakeGroqReply[];
    chat?: FakeGroqReply[];
  } = {},
) {
  const transcription = options.transcription ?? [
    Response.json({ text: "Dün depoda kaydım.", language: "turkish", duration: 12.4 }),
  ];
  const chat = options.chat ?? [chatReply(JSON.stringify(validRecord()))];
  const sent: { url: string; init: RequestInit }[] = [];

  const fetchMock = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    sent.push({ url, init });
    const queue = url.endsWith("/audio/transcriptions") ? transcription : chat;
    const reply = queue.length > 1 ? queue.shift()! : queue[0];
    if (reply instanceof Error) throw reply;
    const response = typeof reply === "function" ? await reply() : reply.clone();
    return response;
  });

  return { fetch: fetchMock as unknown as typeof fetch, sent, calls: () => fetchMock.mock.calls.length };
}

export function chatReply(content: string): Response {
  return Response.json({ choices: [{ message: { role: "assistant", content } }] });
}

export function groqError(status: number, message: string, retryAfter?: number): Response {
  const headers: Record<string, string> = {};
  if (retryAfter !== undefined) headers["retry-after"] = String(retryAfter);
  return Response.json({ error: { message, type: "error" } }, { status, headers });
}
