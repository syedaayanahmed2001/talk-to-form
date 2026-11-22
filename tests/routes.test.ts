import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtractResponse, TranscribeResponse } from "@/lib/api-types";
import { POST as extract } from "@/app/api/extract/route";
import { POST as transcribe } from "@/app/api/transcribe/route";
import { readConfig } from "@/lib/server/config";

/** The real route exports, with no key in the environment: the way CI and a fresh clone run. */
describe("route handlers without a key", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("[DEMO-01] [API-01] /api/transcribe serves a recorded transcript", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const form = new FormData();
    form.append("audio", new File([new Uint8Array(100)], "clip.webm", { type: "audio/webm" }));
    const response = await transcribe(new Request("http://test/api/transcribe", { method: "POST", body: form }));
    const body = (await response.json()) as TranscribeResponse;
    expect(response.status).toBe(200);
    expect(body.mode).toBe("demo");
    expect(body.notice?.kind).toBe("no-key");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("[DEMO-01] [API-02] /api/extract serves a recorded, validated result", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await extract(
      new Request("http://test/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transcript: "Gestern bin ich ausgerutscht.", outputLanguage: "de" }),
      }),
    );
    const body = (await response.json()) as ExtractResponse;
    expect(response.status).toBe(200);
    expect(body.mode).toBe("demo");
    expect(body.notice?.kind).toBe("no-key");
    expect(body.result.failures).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("[API-07] [API-09] the key is read per call from the environment only", () => {
    vi.stubEnv("GROQ_API_KEY", "  ");
    expect(readConfig().apiKey).toBeNull();
    vi.stubEnv("GROQ_API_KEY", "gsk_x");
    expect(readConfig().apiKey).toBe("gsk_x");
    expect(readConfig({}).chatModel).toBe("openai/gpt-oss-120b");
    expect(readConfig({}).sttModel).toBe("whisper-large-v3-turbo");
  });
});
