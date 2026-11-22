import type { Sample } from "@/lib/demo/samples";
import type { OutputLanguage } from "@/lib/incident/fields";
import type { Provider } from "./types";

/**
 * Replays a sample's recorded model answers in order. Used for demo mode and tests; makes the
 * demo run the same pipeline (validation, repair, source check) as live traffic.
 */
export function createReplayProvider(sample: Sample, outputLanguage: OutputLanguage): Provider {
  const answers = sample.recorded[outputLanguage];
  let next = 0;
  return {
    name: `replay:${sample.id}`,
    async transcribe() {
      return {
        text: sample.transcript,
        language: sample.languageName.toLowerCase(),
        durationSec: sample.durationSec,
      };
    },
    async completeJson() {
      // Past the end of the recording, repeat the last answer rather than fail.
      const answer = answers[Math.min(next, answers.length - 1)];
      next += 1;
      return JSON.stringify(answer);
    },
  };
}
