import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ALLOWED_KEYWORDS,
  INCIDENT_JSON_SCHEMA,
  toStrictJsonSchema,
  type JsonSchema,
} from "@/lib/incident/json-schema";

type Visit = (node: JsonSchema, path: string) => void;

/** Visit every schema node (not property-name maps, not enum values). */
function walk(node: unknown, path: string, visit: Visit): void {
  if (Array.isArray(node)) {
    node.forEach((child, i) => walk(child, `${path}[${i}]`, visit));
    return;
  }
  if (typeof node !== "object" || node === null) return;
  const schema = node as JsonSchema;
  visit(schema, path);
  for (const [key, value] of Object.entries(schema)) {
    if (key === "properties" || key === "$defs") {
      for (const [name, child] of Object.entries(value as JsonSchema)) {
        walk(child, `${path}.${name}`, visit);
      }
    } else if (key === "items" || key === "anyOf") {
      walk(value, `${path}.${key}`, visit);
    }
  }
}

describe("strict JSON schema for the model", () => {
  it("[EXT-01] closes every object and lists all its properties as required", () => {
    let objects = 0;
    walk(INCIDENT_JSON_SCHEMA, "$", (node, path) => {
      if (node.type !== "object") return;
      objects += 1;
      expect(node.additionalProperties, path).toBe(false);
      expect(node.required, path).toEqual(Object.keys(node.properties as object));
    });
    // root + 9 envelopes + 4 list item objects
    expect(objects).toBe(14);
  });

  it("[EXT-01] keeps only keywords Groq strict mode supports", () => {
    walk(INCIDENT_JSON_SCHEMA, "$", (node, path) => {
      for (const key of Object.keys(node)) {
        expect(ALLOWED_KEYWORDS.has(key), `${path}: ${key}`).toBe(true);
      }
    });
    const text = JSON.stringify(INCIDENT_JSON_SCHEMA);
    expect(text).not.toContain('"pattern"');
    expect(text).not.toContain('"minLength"');
    expect(text).not.toContain('"$schema"');
  });

  it("[EXT-01] expresses 'not mentioned' as a union with null and keeps format hints in descriptions", () => {
    const date = (INCIDENT_JSON_SCHEMA.properties as Record<string, JsonSchema>).date;
    const value = (date.properties as Record<string, JsonSchema>).value;
    expect(value.anyOf).toEqual([{ type: "string" }, { type: "null" }]);
    expect(String(value.description)).toContain("YYYY-MM-DD");
  });

  it("[EXT-01] forces strictness even when the Zod object was loose", () => {
    const loose = z.looseObject({ a: z.string().optional() });
    const schema = toStrictJsonSchema(loose);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["a"]);
  });
});
