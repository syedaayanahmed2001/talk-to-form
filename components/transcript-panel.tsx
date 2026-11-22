import type { Notice } from "@/lib/api-types";

/** Highlight the active field's source in the transcript, if it is there verbatim. */
function withHighlight(transcript: string, source: string | null) {
  if (!source) return transcript;
  const at = transcript.indexOf(source);
  if (at < 0) return transcript;
  return (
    <>
      {transcript.slice(0, at)}
      <mark className="rounded-sm bg-accent/25 px-0.5 text-text">{source}</mark>
      {transcript.slice(at + source.length)}
    </>
  );
}

export function Notices({ notices }: { notices: Notice[] }) {
  if (notices.length === 0) return null;
  return (
    <div className="space-y-2" data-testid="notices">
      {notices.map((notice) => (
        <div
          key={notice.kind}
          className="rounded-lg border border-accent/50 bg-accent/10 px-4 py-3 text-sm"
          data-notice={notice.kind}
        >
          <p className="font-semibold text-accent">
            {notice.kind === "sample" ? "Recorded example" : "Recorded example, not live"}
          </p>
          <p className="mt-1">{notice.message}</p>
        </div>
      ))}
    </div>
  );
}

export function TranscriptPanel({
  transcript,
  languageLabel,
  langAttr,
  durationSec,
  activeSource,
}: {
  transcript: string;
  languageLabel: string | null;
  langAttr: string | undefined;
  durationSec: number | null;
  activeSource: string | null;
}) {
  return (
    <section aria-labelledby="transcript-heading" className="rounded-lg border border-border bg-surface p-4">
      <h2 id="transcript-heading" className="text-lg font-semibold">
        2. Transcript
      </h2>
      <p className="mb-3 text-sm text-muted">
        {[languageLabel, durationSec !== null ? `${Math.round(durationSec)} s` : null]
          .filter(Boolean)
          .join(" · ") || "Spoken language detected automatically"}
        . Move to a field to see where it came from.
      </p>
      <p dir="auto" lang={langAttr} className="text-lg leading-relaxed break-words" data-testid="transcript">
        {withHighlight(transcript, activeSource)}
      </p>
    </section>
  );
}
