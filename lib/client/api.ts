import type {
  ErrorResponse,
  ExtractResponse,
  StatusResponse,
  TranscribeResponse,
} from "@/lib/api-types";
import type { SampleId } from "@/lib/demo/samples";
import type { OutputLanguage } from "@/lib/incident/fields";

/** Browser-side calls to the three routes. Errors become messages a person can act on. */

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // fall through to the generic message
  }
  if (!response.ok) {
    const message =
      (body as ErrorResponse | null)?.error?.message ??
      `The server answered with HTTP ${response.status}. Please try again.`;
    throw new ApiError(message, response.status);
  }
  return body as T;
}

async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ApiError("Could not reach the server. Check your connection and try again.", 0);
  }
}

export async function fetchStatus(): Promise<StatusResponse> {
  return readJson<StatusResponse>(await send("/api/status", { cache: "no-store" }));
}

export async function transcribe(file: File, durationMs: number | null): Promise<TranscribeResponse> {
  const form = new FormData();
  form.append("audio", file);
  if (durationMs !== null) form.append("durationMs", String(Math.round(durationMs)));
  return readJson<TranscribeResponse>(await send("/api/transcribe", { method: "POST", body: form }));
}

export async function extract(body: {
  transcript: string;
  outputLanguage: OutputLanguage;
  referenceDate: string;
  sampleId?: SampleId;
}): Promise<ExtractResponse> {
  return readJson<ExtractResponse>(
    await send("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

/** Today in the visitor's time zone, YYYY-MM-DD: what "yesterday" in the recording refers to. */
export function localToday(now: Date = new Date()): string {
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}
