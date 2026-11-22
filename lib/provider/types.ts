import type { JsonSchema } from "@/lib/incident/json-schema";

/**
 * What the pipeline needs from a model provider. The Groq client implements it for live use,
 * the replay provider implements it from recorded fixtures, and tests implement it inline.
 */

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type JsonCompletionRequest = {
  messages: ChatMessage[];
  schemaName: string;
  jsonSchema: JsonSchema;
};

export type TranscriptionRequest = {
  audio: Blob;
  filename: string;
};

export type Transcription = {
  text: string;
  /** Language the speech-to-text model detected, if it reports one. */
  language: string | null;
  /** Duration of the audio in seconds, if the provider reports it. */
  durationSec: number | null;
};

export interface Provider {
  readonly name: string;
  transcribe(request: TranscriptionRequest): Promise<Transcription>;
  /** Returns the raw text of the model's answer; parsing and validation are the caller's job. */
  completeJson(request: JsonCompletionRequest): Promise<string>;
}

/** A failed provider call, carrying the HTTP status so routes can decide on a fallback. */
export class ProviderError extends Error {
  readonly status: number;
  readonly retryAfterSec: number | null;

  constructor(message: string, status: number, retryAfterSec: number | null = null) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

/** Rate limits and server-side failures are worth falling back from; 4xx input errors are not. */
export function isTransientProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError && (error.status === 429 || error.status >= 500);
}
