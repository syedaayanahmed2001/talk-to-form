import type { Mode } from "@/lib/api-types";
import type { ExtractionResult } from "@/lib/extract/pipeline";
import type { OutputLanguage } from "@/lib/incident/fields";
import {
  FIELD_KEYS,
  valueSchemas,
  type Confidence,
  type FieldValue,
  type IncidentFieldKey,
} from "@/lib/incident/schema";

/**
 * Review state: what the human has checked so far. Pure functions, no React, so the rules
 * ("nothing is final until every field is approved", "edits pass the same schema as model
 * output") are tested on their own.
 */

export type FieldStatus = "pending" | "approved" | "failing";

export type FieldReview = {
  status: FieldStatus;
  value: FieldValue | null;
  source: string | null;
  /** The model's confidence. Null when the model produced nothing usable. */
  confidence: Confidence | null;
  edited: boolean;
  /** Validation messages for a failing field. */
  messages: string[];
  /** Source-check warning, if any. */
  warning: string | null;
};

export type ReviewState = Record<IncidentFieldKey, FieldReview>;

export function initReview(result: ExtractionResult): ReviewState {
  const state = {} as ReviewState;
  for (const key of FIELD_KEYS) {
    const field = result.fields[key];
    const warning = result.warnings.find((w) => w.field === key)?.message ?? null;
    if (field) {
      state[key] = {
        status: "pending",
        value: field.value,
        source: field.source,
        confidence: field.confidence,
        edited: false,
        messages: [],
        warning,
      };
    } else {
      state[key] = {
        status: "failing",
        value: null,
        source: null,
        confidence: null,
        edited: false,
        messages: result.failures.filter((f) => f.field === key).map((f) => f.message),
        warning,
      };
    }
  }
  return state;
}

/** Approve a field as the model filled it. A failing field cannot be approved, only fixed. */
export function approve(state: ReviewState, key: IncidentFieldKey): ReviewState {
  if (state[key].status !== "pending") return state;
  return { ...state, [key]: { ...state[key], status: "approved" } };
}

export function reopen(state: ReviewState, key: IncidentFieldKey): ReviewState {
  const field = state[key];
  if (field.status !== "approved") return state;
  return { ...state, [key]: { ...field, status: "pending" } };
}

export type SaveResult = { ok: true; state: ReviewState } | { ok: false; errors: string[] };

/** A human edit is checked against the same value schema as model output, then approved. */
export function saveEdit(state: ReviewState, key: IncidentFieldKey, raw: unknown): SaveResult {
  const parsed = valueSchemas[key].safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) =>
        issue.path.length > 0 ? `${issue.path.map(String).join(" › ")}: ${issue.message}` : issue.message,
      ),
    };
  }
  const next: FieldReview = {
    ...state[key],
    status: "approved",
    value: parsed.data as FieldValue,
    edited: true,
    messages: [],
  };
  return { ok: true, state: { ...state, [key]: next } };
}

export function approvedCount(state: ReviewState): number {
  return FIELD_KEYS.filter((key) => state[key].status === "approved").length;
}

export function isComplete(state: ReviewState): boolean {
  return approvedCount(state) === FIELD_KEYS.length;
}

export type FinalRecord = {
  format: "talk-to-form/incident-report";
  version: 1;
  outputLanguage: OutputLanguage;
  mode: Mode;
  sampleId: string | null;
  completedAt: string;
  transcript: { text: string; language: string | null };
  fields: Record<
    IncidentFieldKey,
    {
      value: FieldValue | null;
      source: string | null;
      modelConfidence: Confidence | null;
      editedByHuman: boolean;
      approved: true;
    }
  >;
};

export function buildFinalRecord(
  state: ReviewState,
  meta: {
    outputLanguage: OutputLanguage;
    mode: Mode;
    sampleId: string | null;
    transcript: string;
    language: string | null;
    completedAt: string;
  },
): FinalRecord {
  if (!isComplete(state)) throw new Error("Every field must be approved before the record is final.");
  const fields = {} as FinalRecord["fields"];
  for (const key of FIELD_KEYS) {
    const field = state[key];
    fields[key] = {
      value: field.value,
      source: field.source,
      modelConfidence: field.confidence,
      editedByHuman: field.edited,
      approved: true,
    };
  }
  return {
    format: "talk-to-form/incident-report",
    version: 1,
    outputLanguage: meta.outputLanguage,
    mode: meta.mode,
    sampleId: meta.sampleId,
    completedAt: meta.completedAt,
    transcript: { text: meta.transcript, language: meta.language },
    fields,
  };
}
