import type { z } from "zod";
import { INCIDENT_JSON_SCHEMA, INCIDENT_SCHEMA_NAME } from "@/lib/incident/json-schema";
import {
  FIELD_KEYS,
  fieldSchemas,
  incidentSchema,
  type IncidentFieldKey,
  type IncidentRecord,
} from "@/lib/incident/schema";
import type { JsonCompletionRequest, Provider } from "@/lib/provider/types";
import { buildMessages, buildRepairMessages, type PromptInput, type ValidationIssue } from "./prompt";
import { applySourceCheck, type FieldWarning } from "./source-check";

export type ExtractionInput = PromptInput;

export type FieldFailure = {
  field: IncidentFieldKey;
  path: string;
  message: string;
};

export type ExtractionResult = {
  /** Fields that passed validation, after the source check. */
  fields: Partial<IncidentRecord>;
  /** Fields that did not pass, with reasons. A field is in `fields` or here, never both. */
  failures: FieldFailure[];
  warnings: FieldWarning[];
  /** Provider calls made: 1, or 2 when a repair was needed. Never more. */
  attempts: 1 | 2;
};

type Check =
  | { ok: true; record: IncidentRecord }
  | { ok: false; parsed: unknown; issues: ValidationIssue[] };

function formatPath(path: readonly PropertyKey[]): string {
  return path.length === 0 ? "(root)" : path.map(String).join(".");
}

function toIssues(error: z.ZodError, prefix: readonly PropertyKey[] = []): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: formatPath([...prefix, ...issue.path]),
    message: issue.message,
  }));
}

function check(raw: string): Check {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown parse error";
    return { ok: false, parsed: undefined, issues: [{ path: "(root)", message: `Not valid JSON: ${reason}` }] };
  }
  const result = incidentSchema.safeParse(parsed);
  if (result.success) return { ok: true, record: result.data };
  return { ok: false, parsed, issues: toIssues(result.error) };
}

/** Keep every field that validates on its own; report the rest. */
function salvage(parsed: unknown): { fields: Partial<IncidentRecord>; failures: FieldFailure[] } {
  const fields: Partial<IncidentRecord> = {};
  const failures: FieldFailure[] = [];
  const isObject = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);

  for (const key of FIELD_KEYS) {
    if (!isObject) {
      failures.push({ field: key, path: key, message: "The model's answer was not usable JSON." });
      continue;
    }
    const candidate = (parsed as Record<string, unknown>)[key];
    if (candidate === undefined) {
      failures.push({ field: key, path: key, message: "Missing from the model's answer." });
      continue;
    }
    const result = fieldSchemas[key].safeParse(candidate);
    if (result.success) {
      (fields as Record<IncidentFieldKey, unknown>)[key] = result.data;
    } else {
      for (const issue of toIssues(result.error, [key])) {
        failures.push({ field: key, ...issue });
      }
    }
  }
  return { fields, failures };
}

function finish(
  fields: Partial<IncidentRecord>,
  failures: FieldFailure[],
  attempts: 1 | 2,
  transcript: string,
): ExtractionResult {
  const checked = applySourceCheck(fields, transcript);
  return { fields: checked.fields, failures, warnings: checked.warnings, attempts };
}

/**
 * Transcript in, reviewed-ready record out.
 *
 * 1. Ask the model for JSON that follows the strict schema.
 * 2. Parse and validate with Zod (the schema the JSON schema was generated from).
 * 3. If that fails, ask once more with the validation errors. Never a third time.
 * 4. If the repair fails too, keep what validates and hand the rest to the human.
 * 5. Check every source snippet against the transcript.
 *
 * Errors thrown by the first provider call propagate (the route decides on a fallback).
 * An error on the repair call falls back to what the first answer gave.
 */
export async function extractIncident(
  input: ExtractionInput,
  provider: Provider,
): Promise<ExtractionResult> {
  const messages = buildMessages(input);
  const request: JsonCompletionRequest = {
    messages,
    schemaName: INCIDENT_SCHEMA_NAME,
    jsonSchema: INCIDENT_JSON_SCHEMA,
  };

  const firstRaw = await provider.completeJson(request);
  const first = check(firstRaw);
  if (first.ok) return finish(first.record, [], 1, input.transcript);

  let second: Check;
  try {
    const repairRaw = await provider.completeJson({
      ...request,
      messages: buildRepairMessages(messages, firstRaw, first.issues),
    });
    second = check(repairRaw);
  } catch {
    const fallback = salvage(first.parsed);
    return finish(fallback.fields, fallback.failures, 2, input.transcript);
  }

  if (second.ok) return finish(second.record, [], 2, input.transcript);
  const partial = salvage(second.parsed);
  return finish(partial.fields, partial.failures, 2, input.transcript);
}
