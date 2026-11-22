import { FIELD_META, TREATMENT_LABEL, type OutputLanguage } from "@/lib/incident/fields";
import type { IncidentFieldKey, Treatment } from "@/lib/incident/schema";

const NOT_MENTIONED: Record<OutputLanguage, string> = { de: "Nicht erwähnt", en: "Not mentioned" };
const NONE_STATED: Record<OutputLanguage, string> = { de: "Keine (ausdrücklich genannt)", en: "None (stated)" };

function formatDate(value: string, lang: OutputLanguage): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  const long = new Intl.DateTimeFormat(lang === "de" ? "de-DE" : "en-GB", {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(date);
  return `${long} (${value})`;
}

/** Read-only rendering of a field value, shared by the review cards and the printable record. */
export function FieldValue({
  fieldKey,
  value,
  lang,
}: {
  fieldKey: IncidentFieldKey;
  value: unknown;
  lang: OutputLanguage;
}) {
  const meta = FIELD_META[fieldKey];

  if (value === null || value === undefined) {
    return <p className="italic text-muted">{NOT_MENTIONED[lang]}</p>;
  }
  if (Array.isArray(value) && value.length === 0) {
    return <p className="italic text-muted">{NONE_STATED[lang]}</p>;
  }

  if (meta.kind === "list" && Array.isArray(value)) {
    return (
      <ul className="list-disc space-y-1 pl-5">
        {value.map((item, i) => (
          <li key={i}>{String(item)}</li>
        ))}
      </ul>
    );
  }

  if (meta.kind === "table" && Array.isArray(value)) {
    return (
      <ol className="space-y-2">
        {value.map((row, i) => (
          <li key={i} className="rounded border border-border px-3 py-2">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
              {meta.columns.map((column) => {
                const cell = (row as Record<string, unknown>)[column.key];
                const shown =
                  cell === null || cell === undefined
                    ? "–"
                    : column.key === "treatment"
                      ? TREATMENT_LABEL[cell as Treatment]?.[lang] ?? String(cell)
                      : column.kind === "date"
                        ? formatDate(String(cell), lang)
                        : String(cell);
                return (
                  <div key={column.key} className="contents">
                    <dt className="text-muted">{column.label[lang]}</dt>
                    <dd className="break-words">{shown}</dd>
                  </div>
                );
              })}
            </dl>
          </li>
        ))}
      </ol>
    );
  }

  if (meta.kind === "date") return <p>{formatDate(String(value), lang)}</p>;
  return <p className="whitespace-pre-line break-words">{String(value)}</p>;
}
