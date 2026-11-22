"use client";

import { useState } from "react";
import { FIELD_META, type OutputLanguage } from "@/lib/incident/fields";
import type { Confidence, IncidentFieldKey } from "@/lib/incident/schema";
import type { FieldReview } from "@/lib/review";
import { FieldEditor } from "./field-editor";
import { FieldValue } from "./field-value";

const CONFIDENCE_TEXT: Record<Confidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

const CONFIDENCE_CLASS: Record<Confidence, string> = {
  high: "border-ok/40 text-ok",
  medium: "border-warn/40 text-warn",
  low: "border-bad/50 text-bad",
};

export function FieldCard({
  fieldKey,
  review,
  lang,
  spokenLang,
  onApprove,
  onReopen,
  onSave,
  onFocusSource,
}: {
  fieldKey: IncidentFieldKey;
  review: FieldReview;
  lang: OutputLanguage;
  spokenLang: string | undefined;
  onApprove: () => void;
  onReopen: () => void;
  onSave: (raw: unknown) => string[] | null;
  onFocusSource: (source: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const meta = FIELD_META[fieldKey];
  const label = meta.label[lang];
  const titleId = `field-${fieldKey}`;
  const failing = review.status === "failing";
  const approved = review.status === "approved";

  return (
    <article
      aria-labelledby={titleId}
      data-field={fieldKey}
      data-status={review.status}
      onFocus={() => onFocusSource(review.source)}
      onMouseEnter={() => onFocusSource(review.source)}
      className={`rounded-lg border bg-surface p-4 ${
        approved ? "border-ok/40" : failing ? "border-bad/60" : "border-border"
      }`}
    >
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h3 id={titleId} className="mr-auto text-base font-semibold">
          {label}
        </h3>
        {review.confidence && (
          <span className={`rounded border px-2 py-0.5 text-xs ${CONFIDENCE_CLASS[review.confidence]}`}>
            {CONFIDENCE_TEXT[review.confidence]}
          </span>
        )}
        {review.edited && (
          <span className="rounded border border-border px-2 py-0.5 text-xs text-muted">Edited</span>
        )}
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            approved ? "bg-ok/15 text-ok" : failing ? "bg-bad/15 text-bad" : "bg-surface-2 text-muted"
          }`}
        >
          {approved ? "Approved" : failing ? "Needs a value" : "Waiting for review"}
        </span>
      </header>

      {failing && (
        <div className="mb-3 rounded border border-bad/40 bg-bad/10 px-3 py-2 text-sm">
          <p className="font-medium">Not filled automatically. Please enter it yourself.</p>
          {review.messages.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-muted">
              {review.messages.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {editing ? (
        <FieldEditor
          fieldKey={fieldKey}
          initialValue={review.value}
          lang={lang}
          onCancel={() => setEditing(false)}
          onSave={(raw) => {
            const errors = onSave(raw);
            if (!errors) setEditing(false);
            return errors;
          }}
        />
      ) : (
        <>
          {!failing && (
            <div className="mb-3">
              <FieldValue fieldKey={fieldKey} value={review.value} lang={lang} />
            </div>
          )}

          <div className="mb-3 text-sm">
            <p className="mb-1 text-muted">From the transcript</p>
            {review.source ? (
              <blockquote
                dir="auto"
                lang={spokenLang}
                className="border-s-2 border-accent/70 ps-3 text-text/90 break-words"
              >
                {review.source}
              </blockquote>
            ) : (
              <p className="italic text-muted">No source snippet.</p>
            )}
            {review.warning && (
              <p className="mt-2 text-warn">
                <span className="font-medium">Check this: </span>
                {review.warning}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {approved ? (
              <button type="button" onClick={onReopen} aria-label={`Reopen ${label}`} className="btn-secondary">
                Reopen
              </button>
            ) : (
              <button
                type="button"
                onClick={onApprove}
                disabled={failing}
                aria-label={`Approve ${label}`}
                aria-describedby={failing ? `${titleId}-why` : undefined}
                className="btn-primary"
              >
                Approve
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`${failing ? "Fill in" : "Edit"} ${label}`}
              className="btn-secondary"
            >
              {failing ? "Fill in" : "Edit"}
            </button>
            {failing && (
              <span id={`${titleId}-why`} className="self-center text-sm text-muted">
                Approve is available once a valid value is saved.
              </span>
            )}
          </div>
        </>
      )}
    </article>
  );
}
