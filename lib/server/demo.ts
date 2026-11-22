import type { ExtractResponse, Notice, TranscribeResponse } from "@/lib/api-types";
import { SAMPLES, type Sample } from "@/lib/demo/samples";
import { extractIncident } from "@/lib/extract/pipeline";
import type { OutputLanguage } from "@/lib/incident/fields";
import { createReplayProvider } from "@/lib/provider/replay";

export const NOTICES = {
  sample: (sample: Sample): Notice => ({
    kind: "sample",
    message:
      `Recorded example (${sample.languageName}): a sample transcript and a recorded model ` +
      "answer, replayed through the same validation as a live call.",
  }),
  noKey: (sample: Sample): Notice => ({
    kind: "no-key",
    message:
      "Demo mode: this server has no API key, so you are seeing a recorded example " +
      `(${sample.languageName}), not your own recording.`,
  }),
  providerUnavailable: (sample: Sample): Notice => ({
    kind: "provider-unavailable",
    message:
      "The speech service is busy right now (free-tier limit), so you are seeing a recorded " +
      `example (${sample.languageName}) instead of your recording. Try again in a minute.`,
  }),
};

export const DEFAULT_SAMPLE: Sample = SAMPLES[0];

export function demoTranscription(sample: Sample, notice: Notice): TranscribeResponse {
  return {
    transcript: sample.transcript,
    language: sample.languageName.toLowerCase(),
    durationSec: sample.durationSec,
    mode: "demo",
    sampleId: sample.id,
    notice,
  };
}

export async function demoExtraction(
  sample: Sample,
  outputLanguage: OutputLanguage,
  notice: Notice,
): Promise<ExtractResponse> {
  const result = await extractIncident(
    { transcript: sample.transcript, outputLanguage, referenceDate: sample.referenceDate },
    createReplayProvider(sample, outputLanguage),
  );
  return {
    result,
    transcript: sample.transcript,
    outputLanguage,
    mode: "demo",
    sampleId: sample.id,
    notice,
  };
}
