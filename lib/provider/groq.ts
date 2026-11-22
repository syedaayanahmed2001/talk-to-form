import { ProviderError, type Provider, type Transcription } from "./types";

const BASE_URL = "https://api.groq.com/openai/v1";

type GroqOptions = {
  apiKey: string;
  chatModel: string;
  sttModel: string;
  timeoutMs: number;
  fetch?: typeof fetch;
};

function retryAfter(response: Response): number | null {
  const value = Number(response.headers.get("retry-after"));
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : null;
}

/** Map a failed response to a ProviderError. The message never includes request headers. */
async function toError(response: Response, what: string, secret: string): Promise<ProviderError> {
  let detail = "";
  try {
    const body = (await response.json()) as { error?: { message?: unknown } };
    if (typeof body.error?.message === "string") detail = body.error.message;
  } catch {
    // Body was not JSON; the status says enough.
  }
  // Belt and braces: should the provider ever echo the key back, it does not travel further.
  const message = `${what} failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}`
    .split(secret)
    .join("[redacted]");
  return new ProviderError(message.slice(0, 300), response.status, retryAfter(response));
}

/**
 * Groq via its OpenAI-compatible HTTP API. Plain fetch, no SDK: one less dependency and
 * trivial to mock in tests.
 */
export function createGroqProvider(options: GroqOptions): Provider {
  const doFetch = options.fetch ?? fetch;

  async function call(path: string, init: RequestInit, what: string): Promise<Response> {
    let response: Response;
    try {
      response = await doFetch(`${BASE_URL}${path}`, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${options.apiKey}` },
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === "TimeoutError";
      throw new ProviderError(
        timedOut ? `${what} timed out` : `${what} could not reach the provider`,
        timedOut ? 504 : 503,
      );
    }
    if (!response.ok) throw await toError(response, what, options.apiKey);
    return response;
  }

  return {
    name: "groq",

    async transcribe({ audio, filename }): Promise<Transcription> {
      const form = new FormData();
      form.append("file", audio, filename);
      form.append("model", options.sttModel);
      form.append("response_format", "verbose_json");
      form.append("temperature", "0");
      const response = await call(
        "/audio/transcriptions",
        { method: "POST", body: form },
        "Transcription",
      );
      const body = (await response.json()) as Record<string, unknown>;
      // verbose_json's language and duration are not in Groq's API reference; read them if present.
      return {
        text: typeof body.text === "string" ? body.text.trim() : "",
        language: typeof body.language === "string" ? body.language : null,
        durationSec: typeof body.duration === "number" ? body.duration : null,
      };
    },

    async completeJson({ messages, schemaName, jsonSchema }) {
      const response = await call(
        "/chat/completions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: options.chatModel,
            messages,
            response_format: {
              type: "json_schema",
              json_schema: { name: schemaName, strict: true, schema: jsonSchema },
            },
            // Extraction needs little reasoning, and the free tier counts every token.
            reasoning_effort: "low",
          }),
        },
        "Extraction",
      );
      const body = (await response.json()) as {
        choices?: { message?: { content?: string | null } }[];
      };
      return body.choices?.[0]?.message?.content ?? "";
    },
  };
}
