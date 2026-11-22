import { describe, expect, it } from "vitest";
import type { ExtractionResult } from "@/lib/extract/pipeline";
import { FIELD_KEYS } from "@/lib/incident/schema";
import {
  approve,
  approvedCount,
  buildFinalRecord,
  initReview,
  isComplete,
  reopen,
  saveEdit,
  type ReviewState,
} from "@/lib/review";
import { TRANSCRIPT, validRecord } from "./helpers";

const meta = {
  outputLanguage: "en" as const,
  mode: "live" as const,
  sampleId: null,
  transcript: TRANSCRIPT,
  language: "English",
  completedAt: "2026-11-22T12:00:00.000Z",
};

function result(overrides: Partial<ExtractionResult> = {}): ExtractionResult {
  return { fields: validRecord(), failures: [], warnings: [], attempts: 1, ...overrides };
}

function approveAll(state: ReviewState): ReviewState {
  return FIELD_KEYS.reduce((s, key) => approve(s, key), state);
}

describe("review state", () => {
  it("[UI-03] starts with every field waiting for review, carrying value, source and confidence", () => {
    const state = initReview(result());
    for (const key of FIELD_KEYS) expect(state[key].status).toBe("pending");
    expect(state.time).toMatchObject({ value: "14:30", source: "around half past two", confidence: "medium" });
  });

  it("[UI-03] approve and reopen a field", () => {
    const approved = approve(initReview(result()), "location");
    expect(approved.location.status).toBe("approved");
    expect(approvedCount(approved)).toBe(1);
    expect(reopen(approved, "location").location.status).toBe("pending");
  });

  it("[UI-03] [INC-02] rejects an invalid edit with the schema's message and keeps the field unchanged", () => {
    const state = initReview(result());
    const saved = saveEdit(state, "date", "last Tuesday");
    expect(saved).toEqual({ ok: false, errors: ["Use the format YYYY-MM-DD"] });
    const empty = saveEdit(state, "location", "");
    expect(empty.ok).toBe(false);
  });

  it("[UI-03] a valid edit is marked as edited by a human and approved", () => {
    const saved = saveEdit(initReview(result()), "date", "2026-11-20");
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.state.date).toMatchObject({ status: "approved", value: "2026-11-20", edited: true });
  });

  it("[UI-03] table edits are validated per cell", () => {
    const state = initReview(result());
    const bad = saveEdit(state, "injuries", [{ person: null, description: "", bodyPart: null, treatment: "first_aid" }]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0]).toContain("0 › description");
    const good = saveEdit(state, "injuries", []);
    expect(good.ok && good.state.injuries.value).toEqual([]);
  });

  it("[UI-04] a failing field shows its messages and cannot be approved until a valid value is saved", () => {
    const { date: _drop, ...fields } = validRecord();
    void _drop;
    const state = initReview(
      result({ fields, failures: [{ field: "date", path: "date.value", message: "Use the format YYYY-MM-DD" }] }),
    );
    expect(state.date).toMatchObject({ status: "failing", value: null, messages: ["Use the format YYYY-MM-DD"] });
    expect(approve(state, "date")).toBe(state);
    const fixed = saveEdit(state, "date", "2026-11-21");
    expect(fixed.ok && fixed.state.date.status).toBe("approved");
  });

  it("[EXT-03] [UI-03] carries the source-check warning to the field", () => {
    const state = initReview(
      result({ warnings: [{ field: "witnesses", kind: "source-not-found", message: "Not in transcript." }] }),
    );
    expect(state.witnesses.warning).toBe("Not in transcript.");
  });

  it("[UI-05] the record is final only when all nine fields are approved", () => {
    const state = initReview(result());
    expect(isComplete(state)).toBe(false);
    expect(() => buildFinalRecord(state, meta)).toThrow(/approved/);
    const eight = FIELD_KEYS.slice(0, 8).reduce((s, key) => approve(s, key), state);
    expect(isComplete(eight)).toBe(false);
    const all = approveAll(state);
    expect(isComplete(all)).toBe(true);
    expect(isComplete(reopen(all, "summary"))).toBe(false);
  });

  it("[UI-05] the final record lists every field with approval and edit markers", () => {
    const edited = saveEdit(initReview(result()), "location", "Packing hall 3");
    if (!edited.ok) throw new Error("edit failed");
    const record = buildFinalRecord(approveAll(edited.state), meta);
    expect(record.format).toBe("talk-to-form/incident-report");
    expect(Object.keys(record.fields)).toEqual(FIELD_KEYS);
    expect(record.fields.location).toMatchObject({ value: "Packing hall 3", editedByHuman: true, approved: true });
    expect(record.fields.summary.editedByHuman).toBe(false);
    expect(record.transcript.text).toBe(TRANSCRIPT);
  });
});
