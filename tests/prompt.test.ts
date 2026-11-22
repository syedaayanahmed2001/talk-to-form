import { describe, expect, it } from "vitest";
import { buildMessages, buildRepairMessages } from "@/lib/extract/prompt";

const base = { transcript: "Dün depoda kaydım.", referenceDate: "2026-11-22" };

describe("prompt", () => {
  it("[EXT-06] asks for formal Sie-form German when the output language is German", () => {
    const [system] = buildMessages({ ...base, outputLanguage: "de" });
    expect(system.content).toContain("formal written German");
    expect(system.content).toContain("Sie-form");
    expect(system.content).not.toContain("formal written English");
  });

  it("[EXT-06] asks for formal English when the output language is English", () => {
    const [system] = buildMessages({ ...base, outputLanguage: "en" });
    expect(system.content).toContain("formal written English");
    expect(system.content).not.toContain("Sie-form");
  });

  it("[EXT-06] requires verbatim, untranslated sources and passes the reference date", () => {
    for (const outputLanguage of ["de", "en"] as const) {
      const [system, user] = buildMessages({ ...base, outputLanguage });
      expect(system.content).toContain("verbatim");
      expect(system.content).toContain("Do not translate");
      expect(user.content).toContain("Reference date (day of the recording): 2026-11-22");
      expect(user.content).toContain(base.transcript);
    }
  });

  it("[EXT-04] the repair turn carries the previous answer and every validation error", () => {
    const original = buildMessages({ ...base, outputLanguage: "en" });
    const repair = buildRepairMessages(original, '{"date":"yesterday"}', [
      { path: "date.value", message: "Use the format YYYY-MM-DD" },
    ]);
    expect(repair).toHaveLength(4);
    expect(repair[2]).toEqual({ role: "assistant", content: '{"date":"yesterday"}' });
    expect(repair[3].content).toContain("- date.value: Use the format YYYY-MM-DD");
  });
});
