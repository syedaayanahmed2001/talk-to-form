"use client";

import { useMemo, useState } from "react";
import { FIELD_META } from "@/lib/incident/fields";
import { FIELD_KEYS } from "@/lib/incident/schema";
import type { FinalRecord as FinalRecordData } from "@/lib/review";
import { FieldValue } from "./field-value";

const TITLE = { de: "Meldung eines Vorfalls am Arbeitsplatz", en: "Workplace incident report" };
const FOOTER = {
  de: "Alle Felder wurden von einer Person geprüft und freigegeben. Mit * markierte Felder wurden bei der Prüfung geändert.",
  en: "Every field was reviewed and approved by a person. Fields marked * were changed during review.",
};

export function FinalRecord({
  record,
  onAnnounce,
}: {
  record: FinalRecordData;
  onAnnounce: (message: string) => void;
}) {
  const json = useMemo(() => JSON.stringify(record, null, 2), [record]);
  const [copied, setCopied] = useState(false);
  const lang = record.outputLanguage;
  const downloadHref = useMemo(() => `data:application/json;charset=utf-8,${encodeURIComponent(json)}`, [json]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      onAnnounce("Record copied to the clipboard.");
    } catch {
      onAnnounce("Copying is not available here. Select the JSON text instead.");
    }
  }

  return (
    <section aria-labelledby="final-heading" className="space-y-4" data-testid="final-record">
      <h2 id="final-heading" className="text-lg font-semibold">
        4. Final record
      </h2>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="btn-secondary">
          {copied ? "Copied" : "Copy JSON"}
        </button>
        <a href={downloadHref} download={`incident-report-${record.completedAt.slice(0, 10)}.json`} className="btn-secondary">
          Download JSON
        </a>
        <button type="button" onClick={() => window.print()} className="btn-primary">
          Print
        </button>
      </div>

      <article
        data-print-root
        aria-label="Printable view"
        className="rounded-lg border border-border bg-surface p-5"
        lang={lang}
      >
        <h3 className="text-xl font-semibold">{TITLE[lang]}</h3>
        <p className="mt-1 text-sm text-muted">
          {record.completedAt.slice(0, 16).replace("T", " ")} UTC
          {record.transcript.language ? ` · ${record.transcript.language}` : ""}
          {record.mode === "demo" ? " · Recorded example (demo)" : ""}
        </p>
        <dl className="mt-4 divide-y divide-border">
          {FIELD_KEYS.map((key) => {
            const field = record.fields[key];
            return (
              <div key={key} className="grid gap-1 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
                <dt className="font-medium">
                  {FIELD_META[key].label[lang]}
                  {field.editedByHuman ? " *" : ""}
                </dt>
                <dd className="min-w-0">
                  <FieldValue fieldKey={key} value={field.value} lang={lang} />
                </dd>
              </div>
            );
          })}
        </dl>
        <p className="mt-4 text-sm text-muted">{FOOTER[lang]}</p>
      </article>

      <div>
        <h3 className="mb-2 text-sm font-semibold">JSON</h3>
        <pre
          tabIndex={0}
          aria-label="Final record as JSON"
          className="max-h-96 overflow-auto rounded-lg border border-border bg-bg p-4 font-mono text-xs leading-relaxed"
          data-testid="final-json"
        >
          {json}
        </pre>
      </div>
    </section>
  );
}
