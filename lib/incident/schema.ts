import { z } from "zod";

/**
 * The incident report, defined once.
 *
 * Everything else is derived from this file: the JSON schema the model must follow
 * (lib/incident/json-schema.ts), runtime validation of model output and human edits,
 * and the list of fields the review UI renders (lib/incident/fields.ts).
 *
 * Conventions:
 * - `null` means "not mentioned in the recording". It is never a guess.
 * - An empty list means the speaker said explicitly that there was none
 *   ("nobody else was hurt"). That is a statement, so it needs a source.
 * - Descriptions are written for the model. They survive into the JSON schema and carry the
 *   format hints, because Groq's strict mode does not accept `pattern`.
 */

export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const TREATMENTS = ["none", "first_aid", "medical", "unknown"] as const;
export type Treatment = (typeof TREATMENTS)[number];

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isCalendarDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const text = z.string().trim().min(1, "Must not be empty");

const isoDate = z
  .string()
  .regex(DATE_PATTERN, "Use the format YYYY-MM-DD")
  // Only judge the calendar once the shape is right, so a bad shape reports one error, not two.
  .refine((v) => !DATE_PATTERN.test(v) || isCalendarDate(v), "Not a real calendar date");

const clockTime = z.string().regex(TIME_PATTERN, "Use 24-hour time HH:MM");

/** Value schemas: what a field holds, before the source/confidence envelope. */
export const valueSchemas = {
  summary: text
    .nullable()
    .describe("What happened, in one to three complete sentences."),
  date: isoDate
    .nullable()
    .describe(
      "Date of the incident as YYYY-MM-DD. Resolve relative dates against the reference date.",
    ),
  time: clockTime
    .nullable()
    .describe("Time of the incident as 24-hour HH:MM. Approximate times are allowed."),
  location: text
    .nullable()
    .describe("Where it happened: site, building, room or area, as precise as stated."),
  peopleInvolved: z
    .array(
      z.object({
        name: text.nullable().describe("Name as spoken, or null if not given."),
        role: text.nullable().describe("Job, role or relation to the incident."),
      }),
    )
    .nullable()
    .describe("Everyone directly involved, including the speaker if they were."),
  injuries: z
    .array(
      z.object({
        person: text.nullable().describe("Who was injured, by name or role."),
        description: text.describe("What the injury is."),
        bodyPart: text.nullable().describe("Affected body part, if stated."),
        treatment: z
          .enum(TREATMENTS)
          .describe("none, first_aid, medical (doctor/hospital) or unknown."),
      }),
    )
    .nullable()
    .describe("One entry per injury. Empty list if the speaker says nobody was hurt."),
  immediateActions: z
    .array(text)
    .nullable()
    .describe("What was done right after the incident, one action per entry."),
  witnesses: z
    .array(
      z.object({
        name: text.nullable().describe("Witness name as spoken."),
        contact: text.nullable().describe("Phone, email or team, if stated."),
      }),
    )
    .nullable()
    .describe("People who saw it happen. Empty list if the speaker says nobody saw it."),
  followUps: z
    .array(
      z.object({
        action: text.describe("What still needs to be done."),
        owner: text.nullable().describe("Who should do it, if stated."),
        dueDate: isoDate.nullable().describe("Due date as YYYY-MM-DD, if stated."),
      }),
    )
    .nullable()
    .describe("Follow-up actions the speaker mentions or asks for."),
} as const;

export type IncidentFieldKey = keyof typeof valueSchemas;

/** Field order as the form shows it. Derived from the schema, never typed out twice. */
export const FIELD_KEYS = Object.keys(valueSchemas) as IncidentFieldKey[];

/** Every field travels with the words it came from and how sure the model is. */
function envelope<T extends z.ZodType>(value: T) {
  return z.object({
    value,
    source: text
      .nullable()
      .describe(
        "The shortest verbatim span of the transcript that supports the value, copied exactly in the " +
          "original language and script. Never translated. Null only if value is null.",
      ),
    confidence: z
      .enum(CONFIDENCE_LEVELS)
      .describe("high: stated explicitly. medium: approximate or inferred. low: unsure."),
  });
}

export const fieldSchemas = {
  summary: envelope(valueSchemas.summary),
  date: envelope(valueSchemas.date),
  time: envelope(valueSchemas.time),
  location: envelope(valueSchemas.location),
  peopleInvolved: envelope(valueSchemas.peopleInvolved),
  injuries: envelope(valueSchemas.injuries),
  immediateActions: envelope(valueSchemas.immediateActions),
  witnesses: envelope(valueSchemas.witnesses),
  followUps: envelope(valueSchemas.followUps),
} satisfies Record<IncidentFieldKey, z.ZodType>;

export const incidentSchema = z.object(fieldSchemas);

export type IncidentRecord = z.infer<typeof incidentSchema>;
export type FieldEnvelope<K extends IncidentFieldKey = IncidentFieldKey> = IncidentRecord[K];
export type FieldValue<K extends IncidentFieldKey = IncidentFieldKey> = IncidentRecord[K]["value"];
