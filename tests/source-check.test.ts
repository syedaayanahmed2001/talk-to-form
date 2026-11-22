import { describe, expect, it } from "vitest";
import { applySourceCheck, normalise, sourceInTranscript } from "@/lib/extract/source-check";
import { TRANSCRIPT, validRecord } from "./helpers";

describe("source check", () => {
  it("[EXT-03] accepts snippets that differ only in case, spacing or punctuation", () => {
    expect(sourceInTranscript("ILSE   BRANDT saw it happen!", TRANSCRIPT)).toBe(true);
    expect(sourceInTranscript("we closed the aisle, and cleaned the floor", TRANSCRIPT)).toBe(true);
  });

  it("[EXT-03] rejects words that are not in the transcript", () => {
    expect(sourceInTranscript("Mara broke her arm", TRANSCRIPT)).toBe(false);
    expect(sourceInTranscript("   ", TRANSCRIPT)).toBe(false);
  });

  it("[EXT-03] handles Turkish dotted/dotless i, Arabic diacritics and Devanagari", () => {
    expect(sourceInTranscript("İSKELE", "dün iskele yanında düştü")).toBe(true);
    expect(sourceInTranscript("ışık", "IŞIK yanmıyordu")).toBe(true);
    expect(sourceInTranscript("سَقَطَ", "سقط العامل من السلم")).toBe(true);
    expect(sourceInTranscript("हाथ में चोट", "उसके हाथ में चोट लगी")).toBe(true);
    expect(normalise("Ä  ö")).toBe("ä ö");
  });

  it("[EXT-03] downgrades a fabricated source to low confidence with a warning", () => {
    const record = validRecord();
    record.location = { value: "Loading dock", source: "at the loading dock", confidence: "high" };
    const { fields, warnings } = applySourceCheck(record, TRANSCRIPT);
    expect(fields.location?.confidence).toBe("low");
    expect(warnings).toEqual([
      expect.objectContaining({ field: "location", kind: "source-not-found" }),
    ]);
    expect(fields.summary?.confidence).toBe("high");
  });

  it("[EXT-03] downgrades a value that has no source at all", () => {
    const record = validRecord();
    record.time = { value: "14:30", source: null, confidence: "high" };
    const { fields, warnings } = applySourceCheck(record, TRANSCRIPT);
    expect(fields.time?.confidence).toBe("low");
    expect(warnings[0]).toMatchObject({ field: "time", kind: "no-source" });
  });

  it("[EXT-03] leaves a null value with a null source alone", () => {
    const record = validRecord();
    record.witnesses = { value: null, source: null, confidence: "high" };
    const { fields, warnings } = applySourceCheck(record, TRANSCRIPT);
    expect(fields.witnesses?.confidence).toBe("high");
    expect(warnings).toEqual([]);
  });
});
