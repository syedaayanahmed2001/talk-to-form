import { TREATMENTS, type IncidentFieldKey } from "./schema";

export type OutputLanguage = "de" | "en";
export const OUTPUT_LANGUAGES: readonly OutputLanguage[] = ["de", "en"];

type Localised = Record<OutputLanguage, string>;

export type ColumnMeta = {
  key: string;
  label: Localised;
  kind: "text" | "date" | "select";
  required?: boolean;
  options?: readonly { value: string; label: Localised }[];
};

export type FieldMeta =
  | { kind: "text" | "longtext" | "date" | "time"; label: Localised; hint: Localised }
  | { kind: "list"; label: Localised; hint: Localised }
  | { kind: "table"; label: Localised; hint: Localised; columns: readonly ColumnMeta[] };

const TREATMENT_LABELS: Record<(typeof TREATMENTS)[number], Localised> = {
  none: { de: "Keine", en: "None" },
  first_aid: { de: "Erste Hilfe", en: "First aid" },
  medical: { de: "Ärztliche Behandlung", en: "Medical treatment" },
  unknown: { de: "Unbekannt", en: "Unknown" },
};

/**
 * How each schema field is labelled and edited in the review UI.
 *
 * Typed as a Record over the schema's keys: adding a field to the schema without adding it
 * here is a compile error, and tests/incident-schema.test.ts checks the columns against the
 * item schemas.
 */
export const FIELD_META: Record<IncidentFieldKey, FieldMeta> = {
  summary: {
    kind: "longtext",
    label: { de: "Hergang", en: "What happened" },
    hint: { de: "Kurze Beschreibung des Vorfalls", en: "Short description of the incident" },
  },
  date: {
    kind: "date",
    label: { de: "Datum", en: "Date" },
    hint: { de: "JJJJ-MM-TT", en: "YYYY-MM-DD" },
  },
  time: {
    kind: "time",
    label: { de: "Uhrzeit", en: "Time" },
    hint: { de: "HH:MM, 24 Stunden", en: "HH:MM, 24-hour" },
  },
  location: {
    kind: "text",
    label: { de: "Ort", en: "Location" },
    hint: { de: "Gebäude, Bereich, Raum", en: "Building, area, room" },
  },
  peopleInvolved: {
    kind: "table",
    label: { de: "Beteiligte Personen", en: "People involved" },
    hint: { de: "Name und Funktion", en: "Name and role" },
    columns: [
      { key: "name", label: { de: "Name", en: "Name" }, kind: "text" },
      { key: "role", label: { de: "Funktion", en: "Role" }, kind: "text" },
    ],
  },
  injuries: {
    kind: "table",
    label: { de: "Verletzungen", en: "Injuries" },
    hint: {
      de: "Leere Liste: ausdrücklich niemand verletzt",
      en: "Empty list: nobody was hurt (stated)",
    },
    columns: [
      { key: "person", label: { de: "Person", en: "Person" }, kind: "text" },
      {
        key: "description",
        label: { de: "Verletzung", en: "Injury" },
        kind: "text",
        required: true,
      },
      { key: "bodyPart", label: { de: "Körperteil", en: "Body part" }, kind: "text" },
      {
        key: "treatment",
        label: { de: "Versorgung", en: "Treatment" },
        kind: "select",
        required: true,
        options: TREATMENTS.map((value) => ({ value, label: TREATMENT_LABELS[value] })),
      },
    ],
  },
  immediateActions: {
    kind: "list",
    label: { de: "Sofortmaßnahmen", en: "Immediate actions" },
    hint: { de: "Eine Maßnahme pro Zeile", en: "One action per line" },
  },
  witnesses: {
    kind: "table",
    label: { de: "Zeugen", en: "Witnesses" },
    hint: { de: "Name und Kontakt", en: "Name and contact" },
    columns: [
      { key: "name", label: { de: "Name", en: "Name" }, kind: "text" },
      { key: "contact", label: { de: "Kontakt", en: "Contact" }, kind: "text" },
    ],
  },
  followUps: {
    kind: "table",
    label: { de: "Folgemaßnahmen", en: "Follow-up actions" },
    hint: { de: "Was noch zu tun ist", en: "What still needs doing" },
    columns: [
      { key: "action", label: { de: "Maßnahme", en: "Action" }, kind: "text", required: true },
      { key: "owner", label: { de: "Verantwortlich", en: "Owner" }, kind: "text" },
      { key: "dueDate", label: { de: "Fällig am", en: "Due" }, kind: "date" },
    ],
  },
};

export const TREATMENT_LABEL = TREATMENT_LABELS;
