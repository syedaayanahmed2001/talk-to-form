import type { SampleId } from "@/lib/demo/samples";
import type { ExtractionResult } from "@/lib/extract/pipeline";
import type { OutputLanguage } from "@/lib/incident/fields";

/** Response shapes shared by the route handlers and the UI. No server-only imports here. */

export type Mode = "live" | "demo";

export type Notice = {
  kind: "sample" | "no-key" | "provider-unavailable";
  message: string;
};

export type TranscribeResponse = {
  transcript: string;
  language: string | null;
  durationSec: number | null;
  mode: Mode;
  sampleId?: SampleId;
  notice?: Notice;
};

export type ExtractResponse = {
  result: ExtractionResult;
  transcript: string;
  outputLanguage: OutputLanguage;
  mode: Mode;
  sampleId?: SampleId;
  notice?: Notice;
};

export type StatusResponse = {
  mode: Mode;
  maxAudioSeconds: number;
  maxUploadBytes: number;
};

export type ErrorResponse = {
  error: { code: string; message: string; retryAfterSec?: number };
};
