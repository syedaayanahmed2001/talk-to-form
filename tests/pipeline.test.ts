import { afterEach, describe, expect, it, vi } from "vitest";
import { extractIncident } from "@/lib/extract/pipeline";
import { INCIDENT_JSON_SCHEMA } from "@/lib/incident/json-schema";
import { FIELD_KEYS } from "@/lib/incident/schema";
import { ProviderError } from "@/lib/provider/types";
import { scriptedProvider, TRANSCRIPT, validRecord } from "./helpers";

const input = { transcript: TRANSCRIPT, outputLanguage: "en" as const, referenceDate: "2026-11-22" };

function withBadDate(): string {
  const record = validRecord();
  return JSON.stringify({ ...record, date: { ...record.date, value: "yesterday" } });
}

describe("extraction pipeline", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  afterEach(() => {
    // [EXT-07] the pipeline never reaches the network on its own
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("[EXT-07] [EXT-02] valid first answer: one call, every field with value, source, confidence", async () => {
    const provider = scriptedProvider([JSON.stringify(validRecord())]);
    const result = await extractIncident(input, provider);
    expect(provider.calls).toHaveLength(1);
    expect(result.attempts).toBe(1);
    expect(result.failures).toEqual([]);
    expect(Object.keys(result.fields)).toEqual(FIELD_KEYS);
    expect(result.fields.time).toEqual({
      value: "14:30",
      source: "around half past two",
      confidence: "medium",
    });
  });

  it("[EXT-01] sends the strict JSON schema with the request", async () => {
    const provider = scriptedProvider([JSON.stringify(validRecord())]);
    await extractIncident(input, provider);
    expect(provider.calls[0].jsonSchema).toBe(INCIDENT_JSON_SCHEMA);
    expect(provider.calls[0].schemaName).toBe("incident_report");
  });

  it("[EXT-04] invalid then valid: exactly two calls and the repair names the failing path", async () => {
    const provider = scriptedProvider([withBadDate(), JSON.stringify(validRecord())]);
    const result = await extractIncident(input, provider);
    expect(provider.calls).toHaveLength(2);
    expect(result.attempts).toBe(2);
    expect(result.failures).toEqual([]);
    const repairTurn = provider.calls[1].messages.at(-1)!;
    expect(repairTurn.role).toBe("user");
    expect(repairTurn.content).toContain("date.value");
    expect(provider.calls[1].messages.at(-2)).toEqual({ role: "assistant", content: withBadDate() });
  });

  it("[EXT-04] [EXT-05] invalid twice: still two calls, valid fields kept, failing field listed", async () => {
    const provider = scriptedProvider([withBadDate(), withBadDate(), "never sent"]);
    const result = await extractIncident(input, provider);
    expect(provider.calls).toHaveLength(2);
    expect(result.fields.date).toBeUndefined();
    expect(Object.keys(result.fields)).toHaveLength(8);
    expect(result.failures).toEqual([
      { field: "date", path: "date.value", message: "Use the format YYYY-MM-DD" },
    ]);
  });

  it("[EXT-05] unparseable JSON twice: every field failing, no exception", async () => {
    const provider = scriptedProvider(["Sure! Here is the report:", "{ not json"]);
    const result = await extractIncident(input, provider);
    expect(provider.calls).toHaveLength(2);
    expect(result.fields).toEqual({});
    expect(result.failures.map((f) => f.field)).toEqual(FIELD_KEYS);
  });

  it("[EXT-05] a field missing from the answer is reported as failing", async () => {
    const { witnesses: _omit, ...rest } = validRecord();
    void _omit;
    const provider = scriptedProvider([JSON.stringify(rest), JSON.stringify(rest)]);
    const result = await extractIncident(input, provider);
    expect(result.failures).toEqual([
      { field: "witnesses", path: "witnesses", message: "Missing from the model's answer." },
    ]);
  });

  it("[EXT-05] an error on the repair call keeps what the first answer gave", async () => {
    const provider = scriptedProvider([withBadDate(), new ProviderError("rate limited", 429)]);
    const result = await extractIncident(input, provider);
    expect(provider.calls).toHaveLength(2);
    expect(Object.keys(result.fields)).toHaveLength(8);
    expect(result.failures.map((f) => f.field)).toEqual(["date"]);
  });

  it("[EXT-07] an error on the first call propagates so the caller can fall back", async () => {
    const provider = scriptedProvider([new ProviderError("rate limited", 429)]);
    await expect(extractIncident(input, provider)).rejects.toBeInstanceOf(ProviderError);
  });

  it("[EXT-03] runs the source check on the final fields", async () => {
    const record = validRecord();
    record.location = { value: "Loading dock", source: "loading dock", confidence: "high" };
    const provider = scriptedProvider([JSON.stringify(record)]);
    const result = await extractIncident(input, provider);
    expect(result.fields.location?.confidence).toBe("low");
    expect(result.warnings.map((w) => w.field)).toEqual(["location"]);
  });
});
