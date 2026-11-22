import { z } from "zod";
import { incidentSchema } from "./schema";

export type JsonSchema = { [key: string]: unknown };

/**
 * Keywords Groq's strict structured output documents as supported. Everything else
 * (`pattern`, `format`, `minLength`, `$schema`, ...) is dropped; Zod still enforces
 * those rules when the answer comes back.
 */
export const ALLOWED_KEYWORDS: ReadonlySet<string> = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
  "anyOf",
  "description",
  "$defs",
  "$ref",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strictify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strictify);
  if (!isRecord(node)) return node;

  const out: JsonSchema = {};
  for (const [key, value] of Object.entries(node)) {
    if (!ALLOWED_KEYWORDS.has(key)) continue;
    if ((key === "properties" || key === "$defs") && isRecord(value)) {
      out[key] = Object.fromEntries(
        Object.entries(value).map(([name, child]) => [name, strictify(child)]),
      );
    } else if (key === "enum" || key === "const" || key === "description" || key === "required") {
      out[key] = value;
    } else {
      out[key] = strictify(value);
    }
  }

  if (out.type === "object" || isRecord(out.properties)) {
    const properties = isRecord(out.properties) ? out.properties : {};
    out.properties = properties;
    // Strict mode: every property listed, optional values expressed as `| null`.
    out.required = Object.keys(properties);
    out.additionalProperties = false;
  }
  return out;
}

/** Turn a Zod schema into a JSON schema Groq accepts with `strict: true`. */
export function toStrictJsonSchema(schema: z.ZodType): JsonSchema {
  const raw = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    io: "output",
    unrepresentable: "throw",
  });
  return strictify(raw) as JsonSchema;
}

export const INCIDENT_SCHEMA_NAME = "incident_report";
export const INCIDENT_JSON_SCHEMA: JsonSchema = toStrictJsonSchema(incidentSchema);
