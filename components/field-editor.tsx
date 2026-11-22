"use client";

import { useId, useState } from "react";
import { FIELD_META, type ColumnMeta, type OutputLanguage } from "@/lib/incident/fields";
import type { IncidentFieldKey } from "@/lib/incident/schema";

type Row = Record<string, string>;

type Draft = {
  notMentioned: boolean;
  text: string;
  rows: Row[];
};

function emptyRow(columns: readonly ColumnMeta[]): Row {
  return Object.fromEntries(
    columns.map((c) => [c.key, c.kind === "select" ? (c.options?.at(-1)?.value ?? "") : ""]),
  );
}

function toDraft(fieldKey: IncidentFieldKey, value: unknown): Draft {
  const meta = FIELD_META[fieldKey];
  const draft: Draft = { notMentioned: value === null || value === undefined, text: "", rows: [] };
  if (meta.kind === "list") {
    draft.text = Array.isArray(value) ? value.map(String).join("\n") : "";
  } else if (meta.kind === "table") {
    draft.rows = Array.isArray(value)
      ? value.map((row) =>
          Object.fromEntries(
            meta.columns.map((c) => {
              const cell = (row as Record<string, unknown>)[c.key];
              return [c.key, cell === null || cell === undefined ? "" : String(cell)];
            }),
          ),
        )
      : [];
  } else {
    draft.text = typeof value === "string" ? value : "";
  }
  return draft;
}

/** Turn the form's strings back into the schema's shape; the schema then has the last word. */
function fromDraft(fieldKey: IncidentFieldKey, draft: Draft): unknown {
  const meta = FIELD_META[fieldKey];
  if (draft.notMentioned) return null;
  if (meta.kind === "list") {
    return draft.text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }
  if (meta.kind === "table") {
    return draft.rows.map((row) =>
      Object.fromEntries(
        meta.columns.map((c) => {
          const cell = (row[c.key] ?? "").trim();
          return [c.key, cell === "" && !c.required ? null : cell];
        }),
      ),
    );
  }
  return draft.text.trim();
}

const COPY = {
  notMentioned: { de: "Nicht erwähnt", en: "Not mentioned" },
  save: "Save and approve",
  cancel: "Cancel",
  addRow: "Add entry",
  entry: "Entry",
  remove: "Remove entry",
  noneHint: "No entries means: stated that there were none.",
};

export function FieldEditor({
  fieldKey,
  initialValue,
  lang,
  onSave,
  onCancel,
}: {
  fieldKey: IncidentFieldKey;
  initialValue: unknown;
  lang: OutputLanguage;
  /** Returns validation errors, or null when the value was accepted. */
  onSave: (raw: unknown) => string[] | null;
  onCancel: () => void;
}) {
  const meta = FIELD_META[fieldKey];
  const [draft, setDraft] = useState<Draft>(() => toDraft(fieldKey, initialValue));
  const [errors, setErrors] = useState<string[]>([]);
  const id = useId();
  const label = meta.label[lang];
  const errorId = `${id}-errors`;
  const describedBy = errors.length > 0 ? errorId : `${id}-hint`;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = onSave(fromDraft(fieldKey, draft));
    setErrors(result ?? []);
  }

  const inputClass =
    "w-full rounded border border-border bg-bg px-3 py-2 text-text placeholder:text-muted disabled:opacity-50";

  return (
    <form onSubmit={submit} className="space-y-3" aria-label={`Edit ${label}`} noValidate>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.notMentioned}
          onChange={(e) => setDraft({ ...draft, notMentioned: e.target.checked })}
          className="size-4 accent-accent"
        />
        {COPY.notMentioned[lang]}
      </label>

      {(meta.kind === "text" || meta.kind === "date" || meta.kind === "time") && (
        <div>
          <label htmlFor={`${id}-input`} className="mb-1 block text-sm text-muted">
            {label}
          </label>
          <input
            id={`${id}-input`}
            type={meta.kind}
            value={draft.text}
            disabled={draft.notMentioned}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            aria-describedby={describedBy}
            aria-invalid={errors.length > 0}
            className={inputClass}
          />
        </div>
      )}

      {(meta.kind === "longtext" || meta.kind === "list") && (
        <div>
          <label htmlFor={`${id}-input`} className="mb-1 block text-sm text-muted">
            {label}
          </label>
          <textarea
            id={`${id}-input`}
            rows={meta.kind === "list" ? 4 : 5}
            value={draft.text}
            disabled={draft.notMentioned}
            onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            aria-describedby={describedBy}
            aria-invalid={errors.length > 0}
            className={inputClass}
          />
        </div>
      )}

      {meta.kind === "table" && !draft.notMentioned && (
        <div className="space-y-3">
          {draft.rows.map((row, rowIndex) => (
            <fieldset key={rowIndex} className="rounded border border-border p-3">
              <legend className="px-1 text-sm text-muted">
                {COPY.entry} {rowIndex + 1}
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {meta.columns.map((column) => {
                  const inputId = `${id}-${rowIndex}-${column.key}`;
                  const set = (next: string) => {
                    const rows = draft.rows.map((r, i) => (i === rowIndex ? { ...r, [column.key]: next } : r));
                    setDraft({ ...draft, rows });
                  };
                  return (
                    <div key={column.key}>
                      <label htmlFor={inputId} className="mb-1 block text-sm text-muted">
                        {column.label[lang]}
                        {column.required ? " *" : ""}
                      </label>
                      {column.kind === "select" ? (
                        <select
                          id={inputId}
                          value={row[column.key]}
                          onChange={(e) => set(e.target.value)}
                          className={inputClass}
                        >
                          {column.options?.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label[lang]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id={inputId}
                          type={column.kind === "date" ? "date" : "text"}
                          value={row[column.key]}
                          onChange={(e) => set(e.target.value)}
                          className={inputClass}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setDraft({ ...draft, rows: draft.rows.filter((_, i) => i !== rowIndex) })}
                className="mt-3 text-sm text-muted underline underline-offset-2 hover:text-text"
              >
                {COPY.remove} {rowIndex + 1}
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            onClick={() => setDraft({ ...draft, rows: [...draft.rows, emptyRow(meta.columns)] })}
            className="rounded border border-border px-3 py-1.5 text-sm hover:border-muted"
          >
            {COPY.addRow}
          </button>
        </div>
      )}

      <p id={`${id}-hint`} className="text-sm text-muted">
        {meta.hint[lang]}
        {meta.kind === "table" || meta.kind === "list" ? ` · ${COPY.noneHint}` : ""}
      </p>

      {errors.length > 0 && (
        <ul id={errorId} role="alert" className="list-disc space-y-1 pl-5 text-sm text-bad">
          {errors.map((message, i) => (
            <li key={i}>{message}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" aria-label={`${COPY.save} ${label}`} className="btn-primary">
          {COPY.save}
        </button>
        <button type="button" onClick={onCancel} aria-label={`${COPY.cancel} editing ${label}`} className="btn-secondary">
          {COPY.cancel}
        </button>
      </div>
    </form>
  );
}
