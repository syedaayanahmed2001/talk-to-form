import { describe, expect, it } from "vitest";
import { INCIDENT_JSON_SCHEMA } from "@/lib/incident/json-schema";
import { createGroqProvider } from "@/lib/provider/groq";
import { ProviderError, isTransientProviderError } from "@/lib/provider/types";
import { chatReply, fakeGroq, groqError } from "./fake-groq";

const KEY = "gsk_test_SECRET_123";

function provider(fake: ReturnType<typeof fakeGroq>, timeoutMs = 5000) {
  return createGroqProvider({
    apiKey: KEY,
    chatModel: "openai/gpt-oss-120b",
    sttModel: "whisper-large-v3-turbo",
    timeoutMs,
    fetch: fake.fetch,
  });
}

describe("Groq provider", () => {
  it("[API-01] sends audio to Whisper with verbose_json and reads text, language, duration", async () => {
    const fake = fakeGroq();
    const result = await provider(fake).transcribe({
      audio: new Blob(["abc"], { type: "audio/webm" }),
      filename: "clip.webm",
    });
    expect(result).toEqual({ text: "Dün depoda kaydım.", language: "turkish", durationSec: 12.4 });
    const { url, init } = fake.sent[0];
    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    const form = init.body as FormData;
    expect(form.get("model")).toBe("whisper-large-v3-turbo");
    expect(form.get("response_format")).toBe("verbose_json");
    expect((form.get("file") as File).name).toBe("clip.webm");
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${KEY}`);
  });

  it("[API-01] tolerates a transcription answer without language or duration", async () => {
    const fake = fakeGroq({ transcription: [Response.json({ text: " hello " })] });
    const result = await provider(fake).transcribe({ audio: new Blob(["x"]), filename: "a.wav" });
    expect(result).toEqual({ text: "hello", language: null, durationSec: null });
  });

  it("[API-02] [EXT-01] asks the chat model for strict JSON-schema output with low reasoning effort", async () => {
    const fake = fakeGroq({ chat: [chatReply('{"ok":true}')] });
    const answer = await provider(fake).completeJson({
      messages: [{ role: "user", content: "hi" }],
      schemaName: "incident_report",
      jsonSchema: INCIDENT_JSON_SCHEMA,
    });
    expect(answer).toBe('{"ok":true}');
    const body = JSON.parse(String(fake.sent[0].init.body));
    expect(fake.sent[0].url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.reasoning_effort).toBe("low");
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "incident_report", strict: true, schema: INCIDENT_JSON_SCHEMA },
    });
  });

  it("[API-06] maps 429 to a transient ProviderError carrying retry-after", async () => {
    const fake = fakeGroq({ chat: [groqError(429, "Rate limit reached", 17)] });
    const error = await provider(fake)
      .completeJson({ messages: [], schemaName: "x", jsonSchema: {} })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ status: 429, retryAfterSec: 17 });
    expect(isTransientProviderError(error)).toBe(true);
  });

  it("[API-06] treats network failures and timeouts as transient", async () => {
    const offline = fakeGroq({ chat: [new TypeError("fetch failed")] });
    const e1 = await provider(offline)
      .completeJson({ messages: [], schemaName: "x", jsonSchema: {} })
      .catch((e: unknown) => e);
    expect(e1).toMatchObject({ status: 503 });

    // A server that never answers: only the provider's own timeout signal can end the call.
    const slowFetch = (async (_url: string, init: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    }) as unknown as typeof fetch;
    const p = createGroqProvider({
      apiKey: KEY,
      chatModel: "m",
      sttModel: "s",
      timeoutMs: 20,
      fetch: slowFetch,
    });
    const e2 = await p.completeJson({ messages: [], schemaName: "x", jsonSchema: {} }).catch((e: unknown) => e);
    expect(e2).toMatchObject({ status: 504 });
    expect(isTransientProviderError(e2)).toBe(true);
  });

  it("[API-07] never puts the key into an error message, even if the provider echoes it", async () => {
    const fake = fakeGroq({ chat: [groqError(401, `Invalid API Key: ${KEY}`)] });
    const error = (await provider(fake)
      .completeJson({ messages: [], schemaName: "x", jsonSchema: {} })
      .catch((e: unknown) => e)) as ProviderError;
    expect(error.status).toBe(401);
    expect(error.message).not.toContain(KEY);
    expect(error.message).toContain("[redacted]");
    expect(isTransientProviderError(error)).toBe(false);
  });
});
