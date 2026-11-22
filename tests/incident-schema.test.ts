import { describe, expect, it } from "vitest";
import { FIELD_META } from "@/lib/incident/fields";
import { INCIDENT_JSON_SCHEMA } from "@/lib/incident/json-schema";
import {
  FIELD_KEYS,
  fieldSchemas,
  incidentSchema,
  isCalendarDate,
  valueSchemas,
  type IncidentRecord,
} from "@/lib/incident/schema";
import { validRecord } from "./helpers";

const EXPECTED_KEYS = [
  "summary",
  "date",
  "time",
  "location",
  "peopleInvolved",
  "injuries",
  "immediateActions",
  "witnesses",
  "followUps",
];

function allNull(): IncidentRecord {
  return Object.fromEntries(
    FIELD_KEYS.map((key) => [key, { value: null, source: null, confidence: "high" }]),
  ) as IncidentRecord;
}

describe("incident schema", () => {
  it("[INC-01] defines exactly the nine incident fields, in form order", () => {
    expect(FIELD_KEYS).toEqual(EXPECTED_KEYS);
  });

  it("[INC-01] [EXT-02] parses a complete record with value, source and confidence per field", () => {
    const result = incidentSchema.safeParse(validRecord());
    expect(result.success).toBe(true);
    for (const key of FIELD_KEYS) {
      expect(Object.keys(fieldSchemas[key].shape)).toEqual(["value", "source", "confidence"]);
    }
  });

  it("[INC-02] accepts null for every value (not mentioned)", () => {
    expect(incidentSchema.safeParse(allNull()).success).toBe(true);
  });

  it("[INC-02] accepts an empty list as an explicit 'none'", () => {
    expect(valueSchemas.injuries.safeParse([]).success).toBe(true);
    expect(valueSchemas.witnesses.safeParse([]).success).toBe(true);
  });

  it.each([
    ["yesterday"],
    ["2026-02-30"],
    ["21.11.2026"],
    ["2026-13-01"],
  ])("[INC-02] rejects the date %j", (date) => {
    expect(valueSchemas.date.safeParse(date).success).toBe(false);
  });

  it.each([["25:00"], ["7pm"], ["14.30"], ["9:05"]])("[INC-02] rejects the time %j", (time) => {
    expect(valueSchemas.time.safeParse(time).success).toBe(false);
  });

  it("[INC-02] accepts real dates including leap days", () => {
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2027-02-29")).toBe(false);
    expect(valueSchemas.time.safeParse("00:00").success).toBe(true);
    expect(valueSchemas.time.safeParse("23:59").success).toBe(true);
  });

  it("[INC-02] rejects an unknown treatment, an unknown confidence and empty text", () => {
    const record = validRecord();
    const badTreatment = {
      ...record,
      injuries: {
        ...record.injuries,
        value: [{ person: "X", description: "Cut", bodyPart: null, treatment: "bandage" }],
      },
    };
    expect(incidentSchema.safeParse(badTreatment).success).toBe(false);
    expect(
      incidentSchema.safeParse({ ...record, summary: { ...record.summary, confidence: "sure" } })
        .success,
    ).toBe(false);
    expect(valueSchemas.summary.safeParse("").success).toBe(false);
    expect(valueSchemas.summary.safeParse("   ").success).toBe(false);
  });

  it("[INC-03] schema keys, UI field metadata and JSON-schema properties are the same set", () => {
    const jsonKeys = Object.keys(INCIDENT_JSON_SCHEMA.properties as object);
    expect(Object.keys(FIELD_META)).toEqual(FIELD_KEYS);
    expect(jsonKeys).toEqual(FIELD_KEYS);
  });

  it("[INC-03] table columns in the UI metadata match the item schemas", () => {
    for (const key of FIELD_KEYS) {
      const meta = FIELD_META[key];
      if (meta.kind !== "table") continue;
      const listSchema = valueSchemas[key].unwrap() as unknown as {
        element: { shape: Record<string, unknown> };
      };
      expect(meta.columns.map((c) => c.key)).toEqual(Object.keys(listSchema.element.shape));
    }
  });
});
