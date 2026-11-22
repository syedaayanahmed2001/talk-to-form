import { describe, expect, it, vi } from "vitest";
import type { ExtractResponse, StatusResponse, TranscribeResponse } from "@/lib/api-types";
import { SAMPLES } from "@/lib/demo/samples";
import { createGroqProvider } from "@/lib/provider/groq";
import { LIMITS, type ServerConfig } from "@/lib/server/config";
import { handleExtract, handleStatus, handleTranscribe, type Deps } from "@/lib/server/handlers";
import { createRateLimiter } from "@/lib/server/rate-limit";
import { chatReply, fakeGroq, groqError } from "./fake-groq";
import { TRANSCRIPT, validRecord } from "./helpers";

const KEY = "gsk_test_SECRET_123";

function deps(fake: ReturnType<typeof fakeGroq>, apiKey: string | null = KEY): Deps {
  const config: ServerConfig = { apiKey, chatModel: "openai/gpt-oss-120b", sttModel: "whisper-large-v3-turbo" };
  return {
    config,
    limiter: createRateLimiter(LIMITS.rateLimit),
    createProvider: (c) =>
      createGroqProvider({ apiKey: c.apiKey, chatModel: c.chatModel, sttModel: c.sttModel, timeoutMs: 1000, fetch: fake.fetch }),
    today: () => "2026-11-22",
  };
}

function audioRequest(
  file: File | null = new File([new Uint8Array(2048)], "clip.webm", { type: "audio/webm;codecs=opus" }),
  fields: Record<string, string> = {},
  headers: Record<string, string> = {},
): Request {
  const form = new FormData();
  if (file) form.append("audio", file);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new Request("http://test/api/transcribe", { method: "POST", body: form, headers });
}

function extractRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://test/api/extract", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
}

const live = { transcript: TRANSCRIPT, outputLanguage: "en", referenceDate: "2026-11-22" };

describe("POST /api/transcribe", () => {
  it("[API-01] returns the live transcript, language and duration", async () => {
    const fake = fakeGroq();
    const response = await handleTranscribe(audioRequest(undefined, { durationMs: "12000" }), deps(fake));
    expect(response.status).toBe(200);
    const body = (await response.json()) as TranscribeResponse;
    expect(body).toEqual({ transcript: "Dün depoda kaydım.", language: "turkish", durationSec: 12.4, mode: "live" });
  });

  it("[API-03] rejects an oversize upload by Content-Length before reading it, without calling Groq", async () => {
    const fake = fakeGroq();
    const request = audioRequest(undefined, {}, { "content-length": String(6 * 1024 * 1024) });
    const response = await handleTranscribe(request, deps(fake));
    expect(response.status).toBe(413);
    expect(fake.calls()).toBe(0);
  });

  it("[API-03] rejects a file over 4 MB, without calling Groq", async () => {
    const fake = fakeGroq();
    const big = new File([new Uint8Array(LIMITS.maxUploadBytes + 1)], "big.wav", { type: "audio/wav" });
    const response = await handleTranscribe(audioRequest(big), deps(fake));
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe("upload_too_large");
    expect(fake.calls()).toBe(0);
  });

  it("[API-04] rejects a client-reported duration over 30 s, without calling Groq", async () => {
    const fake = fakeGroq();
    const response = await handleTranscribe(audioRequest(undefined, { durationMs: "31000" }), deps(fake));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("audio_too_long");
    expect(fake.calls()).toBe(0);
  });

  it("[API-04] rejects audio the provider reports as longer than 30 s", async () => {
    const fake = fakeGroq({ transcription: [Response.json({ text: "long", duration: 42 })] });
    const response = await handleTranscribe(audioRequest(), deps(fake));
    expect(response.status).toBe(400);
    expect(fake.calls()).toBe(1);
  });

  it("[API-04] accepts 30.3 s (encoder rounding tolerance)", async () => {
    const fake = fakeGroq({ transcription: [Response.json({ text: "ok", duration: 30.3 })] });
    const response = await handleTranscribe(audioRequest(undefined, { durationMs: "30300" }), deps(fake));
    expect(response.status).toBe(200);
  });

  it("[API-05] the 11th live transcription from one IP gets 429 with Retry-After", async () => {
    const fake = fakeGroq();
    const d = deps(fake);
    const from = (ip: string) => audioRequest(undefined, {}, { "x-forwarded-for": ip });
    for (let i = 0; i < 10; i++) expect((await handleTranscribe(from("203.0.113.9"), d)).status).toBe(200);
    const refused = await handleTranscribe(from("203.0.113.9"), d);
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect((await handleTranscribe(from("198.51.100.1"), d)).status).toBe(200);
  });

  it.each([429, 503])("[API-06] Groq %i falls back to a recorded transcript with a notice", async (status) => {
    const fake = fakeGroq({ transcription: [groqError(status, "busy", 5)] });
    const response = await handleTranscribe(audioRequest(), deps(fake));
    expect(response.status).toBe(200);
    const body = (await response.json()) as TranscribeResponse;
    expect(body.mode).toBe("demo");
    expect(body.notice?.kind).toBe("provider-unavailable");
    expect(body.transcript).toBe(SAMPLES[0].transcript);
  });

  it("[DEMO-01] without a key, returns a recorded transcript with a no-key notice and calls nothing", async () => {
    const fake = fakeGroq();
    const response = await handleTranscribe(audioRequest(), deps(fake, null));
    const body = (await response.json()) as TranscribeResponse;
    expect(body.mode).toBe("demo");
    expect(body.notice?.kind).toBe("no-key");
    expect(body.sampleId).toBe(SAMPLES[0].id);
    expect(fake.calls()).toBe(0);
  });

  it("[API-08] rejects missing audio, unsupported types and non-multipart bodies", async () => {
    const fake = fakeGroq();
    const d = deps(fake);
    const missing = await handleTranscribe(audioRequest(null), d);
    expect(missing.status).toBe(400);
    expect((await missing.json()).error.code).toBe("missing_audio");

    const text = new File(["hello"], "notes.txt", { type: "text/plain" });
    const unsupported = await handleTranscribe(audioRequest(text), d);
    expect(unsupported.status).toBe(400);
    expect((await unsupported.json()).error.code).toBe("unsupported_audio");

    const notForm = new Request("http://test/api/transcribe", { method: "POST", body: "x", headers: { "content-type": "text/plain" } });
    const invalid = await handleTranscribe(notForm, d);
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe("invalid_form");
    expect(fake.calls()).toBe(0);
  });

  it("[API-01] accepts a picked file with a generic type but an audio extension", async () => {
    const fake = fakeGroq();
    const file = new File([new Uint8Array(10)], "voice.m4a", { type: "application/octet-stream" });
    expect((await handleTranscribe(audioRequest(file), deps(fake))).status).toBe(200);
  });

  it("[API-07] a rejected key never appears in the response", async () => {
    const fake = fakeGroq({ transcription: [groqError(401, `Invalid API Key ${KEY}`)] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handleTranscribe(audioRequest(), deps(fake));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(KEY);
  });

  it("[API-01] an empty transcription is reported as no speech", async () => {
    const fake = fakeGroq({ transcription: [Response.json({ text: "   ", duration: 3 })] });
    const response = await handleTranscribe(audioRequest(), deps(fake));
    expect(response.status).toBe(422);
  });
});

describe("POST /api/extract", () => {
  it("[API-02] returns a validated live extraction", async () => {
    const fake = fakeGroq();
    const response = await handleExtract(extractRequest(live), deps(fake));
    expect(response.status).toBe(200);
    const body = (await response.json()) as ExtractResponse;
    expect(body.mode).toBe("live");
    expect(body.notice).toBeUndefined();
    expect(body.result.failures).toEqual([]);
    expect(body.result.fields.summary?.value).toBe(validRecord().summary.value);
  });

  it("[API-02] [EXT-06] passes the reference date, defaulting to today", async () => {
    const fake = fakeGroq();
    await handleExtract(extractRequest({ transcript: TRANSCRIPT, outputLanguage: "de" }), deps(fake));
    const body = JSON.parse(String(fake.sent[0].init.body));
    expect(body.messages[1].content).toContain("2026-11-22");
    expect(body.messages[0].content).toContain("formal written German");
  });

  it("[EXT-04] a repair round-trip happens inside one request", async () => {
    const bad = JSON.stringify({ ...validRecord(), time: { value: "half past two", source: null, confidence: "low" } });
    const fake = fakeGroq({ chat: [chatReply(bad), chatReply(JSON.stringify(validRecord()))] });
    const body = (await (await handleExtract(extractRequest(live), deps(fake))).json()) as ExtractResponse;
    expect(body.result.attempts).toBe(2);
    expect(fake.calls()).toBe(2);
  });

  it("[API-05] the 11th live extraction from one IP gets 429; sample requests never count", async () => {
    const fake = fakeGroq();
    const d = deps(fake);
    const headers = { "x-forwarded-for": "203.0.113.5" };
    for (let i = 0; i < 20; i++) {
      const sample = await handleExtract(extractRequest({ ...live, sampleId: "kitchen-ar" }, headers), d);
      expect(sample.status).toBe(200);
    }
    for (let i = 0; i < 10; i++) expect((await handleExtract(extractRequest(live, headers), d)).status).toBe(200);
    const refused = await handleExtract(extractRequest(live, headers), d);
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBeTruthy();
    expect((await refused.json()).error.code).toBe("rate_limited");
  });

  it.each([429, 500, 503])("[API-06] Groq %i falls back to a recorded example with a notice", async (status) => {
    const fake = fakeGroq({ chat: [groqError(status, "busy")] });
    const response = await handleExtract(extractRequest(live), deps(fake));
    expect(response.status).toBe(200);
    const body = (await response.json()) as ExtractResponse;
    expect(body.mode).toBe("demo");
    expect(body.notice?.kind).toBe("provider-unavailable");
    expect(body.result.failures).toEqual([]);
  });

  it("[API-06] a recorded sample transcript falls back to its own recording", async () => {
    const sample = SAMPLES[2];
    const fake = fakeGroq({ chat: [groqError(429, "busy")] });
    const response = await handleExtract(
      extractRequest({ transcript: sample.transcript, outputLanguage: "en" }),
      deps(fake),
    );
    const body = (await response.json()) as ExtractResponse;
    expect(body.sampleId).toBe(sample.id);
    expect(body.transcript).toBe(sample.transcript);
  });

  it("[DEMO-01] without a key, returns a recorded result with a no-key notice", async () => {
    const fake = fakeGroq();
    const body = (await (await handleExtract(extractRequest(live), deps(fake, null))).json()) as ExtractResponse;
    expect(body.mode).toBe("demo");
    expect(body.notice?.kind).toBe("no-key");
    expect(body.transcript).toBe(SAMPLES[0].transcript);
    expect(fake.calls()).toBe(0);
  });

  it("[API-02] a picked sample is replayed and labelled as a recorded example", async () => {
    const fake = fakeGroq();
    const body = (await (
      await handleExtract(extractRequest({ ...live, sampleId: "workshop-hi", outputLanguage: "de" }), deps(fake))
    ).json()) as ExtractResponse;
    expect(body.mode).toBe("demo");
    expect(body.notice?.kind).toBe("sample");
    expect(body.notice?.message).toMatch(/Recorded example/);
    expect(body.result.fields.injuries?.value).toEqual([]);
    expect(fake.calls()).toBe(0);
  });

  it.each([
    ["invalid JSON", "{not json", "invalid_json"],
    ["missing transcript", { outputLanguage: "en" }, "invalid_request"],
    ["blank transcript", { transcript: "   ", outputLanguage: "en" }, "invalid_request"],
    ["overlong transcript", { transcript: "a".repeat(4001), outputLanguage: "en" }, "invalid_request"],
    ["unknown output language", { transcript: "x", outputLanguage: "fr" }, "invalid_request"],
    ["bad reference date", { transcript: "x", outputLanguage: "en", referenceDate: "2026-02-30" }, "invalid_request"],
    ["unknown sample", { transcript: "x", outputLanguage: "en", sampleId: "nope" }, "invalid_request"],
  ])("[API-08] rejects %s with 400", async (_label, body, code) => {
    const fake = fakeGroq();
    const response = await handleExtract(extractRequest(body), deps(fake));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error.code).toBe(code);
    expect(json.error.message.length).toBeGreaterThan(0);
    expect(fake.calls()).toBe(0);
  });

  it("[API-07] a rejected key never appears in the response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fake = fakeGroq({ chat: [groqError(401, `Invalid API Key ${KEY}`)] });
    const response = await handleExtract(extractRequest(live), deps(fake));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(KEY);
  });

  it("[API-07] no successful response contains the key either", async () => {
    const fake = fakeGroq();
    const text = await (await handleExtract(extractRequest(live), deps(fake))).text();
    expect(text).not.toContain(KEY);
  });
});

describe("GET /api/status", () => {
  it("[API-09] reports live with a key and demo without, uncached", async () => {
    const withKey = handleStatus({ config: { apiKey: KEY, chatModel: "m", sttModel: "s" } });
    const without = handleStatus({ config: { apiKey: null, chatModel: "m", sttModel: "s" } });
    const liveText = await withKey.text();
    expect((JSON.parse(liveText) as StatusResponse).mode).toBe("live");
    expect(liveText).not.toContain(KEY);
    const demo = (await without.json()) as StatusResponse;
    expect(demo).toEqual({ mode: "demo", maxAudioSeconds: 30, maxUploadBytes: 4 * 1024 * 1024 });
    expect(without.headers.get("cache-control")).toBe("no-store");
  });
});
