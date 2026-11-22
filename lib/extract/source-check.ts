import {
  FIELD_KEYS,
  type FieldEnvelope,
  type IncidentFieldKey,
  type IncidentRecord,
} from "@/lib/incident/schema";

export type FieldWarning = {
  field: IncidentFieldKey;
  kind: "source-not-found" | "no-source";
  message: string;
};

/**
 * Normalise text for "is this snippet really in the transcript?".
 *
 * Case, whitespace and punctuation differences are forgiven; words are not. Handles Turkish
 * dotted and dotless i (İ/ı lower-case unpredictably across runtimes) and drops Arabic
 * diacritics and tatweel, which models add or remove when they copy text.
 */
export function normalise(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[İIı]/g, "i")
    .toLowerCase()
    .replace(/̇/g, "")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function sourceInTranscript(source: string, transcript: string): boolean {
  const needle = normalise(source);
  return needle.length > 0 && normalise(transcript).includes(needle);
}

/**
 * Flag fields whose claimed evidence does not hold up and lower their confidence.
 * A value of null needs no source; anything else (including an empty list) does.
 */
export function applySourceCheck(
  fields: Partial<IncidentRecord>,
  transcript: string,
): { fields: Partial<IncidentRecord>; warnings: FieldWarning[] } {
  const checked: Partial<IncidentRecord> = {};
  const warnings: FieldWarning[] = [];

  for (const key of FIELD_KEYS) {
    const field = fields[key] as FieldEnvelope | undefined;
    if (!field) continue;
    let next: FieldEnvelope = field;

    if (field.value !== null) {
      if (field.source === null) {
        warnings.push({ field: key, kind: "no-source", message: "No source snippet given." });
        next = { ...field, confidence: "low" };
      } else if (!sourceInTranscript(field.source, transcript)) {
        warnings.push({
          field: key,
          kind: "source-not-found",
          message: "The source snippet does not appear in the transcript.",
        });
        next = { ...field, confidence: "low" };
      }
    }
    (checked as Record<IncidentFieldKey, FieldEnvelope>)[key] = next;
  }
  return { fields: checked, warnings };
}
