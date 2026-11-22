import { describe, expect, it } from "vitest";
import { SAMPLES, matchSample } from "@/lib/demo/samples";
import { extractIncident } from "@/lib/extract/pipeline";
import { OUTPUT_LANGUAGES } from "@/lib/incident/fields";
import { FIELD_KEYS } from "@/lib/incident/schema";
import { createReplayProvider } from "@/lib/provider/replay";

describe("recorded samples", () => {
  it("[DEMO-02] three samples in three different spoken languages: Turkish, Arabic, Hindi", () => {
    expect(SAMPLES).toHaveLength(3);
    expect(SAMPLES.map((s) => s.spokenLanguage).sort()).toEqual(["ar", "hi", "tr"]);
  });

  it("[DEMO-02] each sample has recorded answers for German and English", () => {
    for (const sample of SAMPLES) {
      for (const lang of OUTPUT_LANGUAGES) {
        expect(sample.recorded[lang].length, `${sample.id}/${lang}`).toBeGreaterThan(0);
      }
      expect(sample.transcript.length).toBeLessThanOrEqual(4000);
      expect(sample.durationSec).toBeLessThanOrEqual(30);
    }
  });

  it.each(SAMPLES.flatMap((s) => OUTPUT_LANGUAGES.map((lang) => [s.id, lang] as const)))(
    "[DEMO-03] %s (%s) passes the real pipeline with no failures and no source warnings",
    async (id, lang) => {
      const sample = SAMPLES.find((s) => s.id === id)!;
      const result = await extractIncident(
        { transcript: sample.transcript, outputLanguage: lang, referenceDate: sample.referenceDate },
        createReplayProvider(sample, lang),
      );
      expect(result.failures).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(Object.keys(result.fields)).toEqual(FIELD_KEYS);
    },
  );

  it("[DEMO-03] every recorded source is a verbatim substring of its transcript", () => {
    for (const sample of SAMPLES) {
      for (const lang of OUTPUT_LANGUAGES) {
        for (const answer of sample.recorded[lang]) {
          for (const field of Object.values(answer as Record<string, { source: string | null }>)) {
            if (field.source !== null) {
              expect(sample.transcript, `${sample.id}/${lang}`).toContain(field.source);
            }
          }
        }
      }
    }
  });

  it("[DEMO-02] the Turkish replay goes through the repair step", async () => {
    const sample = SAMPLES.find((s) => s.spokenLanguage === "tr")!;
    for (const lang of OUTPUT_LANGUAGES) {
      const result = await extractIncident(
        { transcript: sample.transcript, outputLanguage: lang, referenceDate: sample.referenceDate },
        createReplayProvider(sample, lang),
      );
      expect(result.attempts).toBe(2);
      expect(result.fields.date?.value).toBe("2026-11-17");
    }
  });

  it("[DEMO-01] a transcript is matched back to its sample regardless of whitespace", () => {
    const sample = SAMPLES[1];
    expect(matchSample(`  ${sample.transcript.replace(/ /g, "  ")} `)?.id).toBe(sample.id);
    expect(matchSample("something else entirely")).toBeNull();
  });
});
