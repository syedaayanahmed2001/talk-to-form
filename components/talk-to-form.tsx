"use client";

import { useEffect, useRef, useState } from "react";
import type { Mode, Notice, StatusResponse } from "@/lib/api-types";
import { ApiError, extract, fetchStatus, localToday, transcribe } from "@/lib/client/api";
import { SAMPLES, type SampleId } from "@/lib/demo/samples";
import { FIELD_META, type OutputLanguage } from "@/lib/incident/fields";
import { FIELD_KEYS, type IncidentFieldKey } from "@/lib/incident/schema";
import {
  approve,
  approvedCount,
  buildFinalRecord,
  initReview,
  isComplete,
  reopen,
  saveEdit,
  type ReviewState,
} from "@/lib/review";
import { FieldCard } from "./field-card";
import { FinalRecord } from "./final-record";
import { InputPanel } from "./input-panel";
import { Notices, TranscriptPanel } from "./transcript-panel";

type Phase = "idle" | "transcribing" | "extracting" | "review";

type TranscriptInfo = {
  text: string;
  languageLabel: string | null;
  langAttr: string | undefined;
  durationSec: number | null;
  sampleId?: SampleId;
  notice?: Notice;
};

type Extraction = {
  mode: Mode;
  notice?: Notice;
  outputLanguage: OutputLanguage;
};

const ISO_FROM_WHISPER: Record<string, string> = {
  turkish: "tr",
  arabic: "ar",
  hindi: "hi",
  german: "de",
  english: "en",
  urdu: "ur",
  persian: "fa",
  russian: "ru",
  ukrainian: "uk",
  polish: "pl",
  romanian: "ro",
  spanish: "es",
  french: "fr",
  italian: "it",
};

function langAttrFor(language: string | null): string | undefined {
  if (!language) return undefined;
  const lower = language.toLowerCase();
  return ISO_FROM_WHISPER[lower] ?? (lower.length === 2 ? lower : undefined);
}

function capitalise(value: string | null): string | null {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : null;
}

export function TalkToForm() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [outputLanguage, setOutputLanguage] = useState<OutputLanguage>("de");
  const [transcript, setTranscript] = useState<TranscriptInfo | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const requestRef = useRef(0);

  useEffect(() => {
    fetchStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const busy = phase === "transcribing" || phase === "extracting";

  function fail(err: unknown) {
    const message = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
    setError(message);
    setPhase(review ? "review" : "idle");
    setAnnouncement("");
  }

  async function runExtraction(info: TranscriptInfo, lang: OutputLanguage) {
    const id = ++requestRef.current;
    setPhase("extracting");
    setError(null);
    setAnnouncement("Filling in the form…");
    try {
      const response = await extract({
        transcript: info.text,
        outputLanguage: lang,
        referenceDate: localToday(),
        ...(info.sampleId ? { sampleId: info.sampleId } : {}),
      });
      if (id !== requestRef.current) return;
      // In demo mode the server may answer for a recorded transcript; show the one it used.
      const shown: TranscriptInfo =
        response.transcript === info.text
          ? info
          : (() => {
              const sample = SAMPLES.find((s) => s.id === response.sampleId);
              return {
                ...info,
                text: response.transcript,
                languageLabel: sample?.languageName ?? null,
                langAttr: sample?.spokenLanguage,
                durationSec: sample?.durationSec ?? null,
              };
            })();
      const next = initReview(response.result);
      const failing = FIELD_KEYS.filter((key) => next[key].status === "failing").length;
      setTranscript(shown);
      setExtraction({ mode: response.mode, notice: response.notice, outputLanguage: lang });
      setReview(next);
      setCompletedAt(null);
      setPhase("review");
      setAnnouncement(
        `Form filled. ${FIELD_KEYS.length} fields to review` +
          (failing > 0 ? `, ${failing} need${failing === 1 ? "s" : ""} a value from you.` : "."),
      );
    } catch (err) {
      if (id === requestRef.current) fail(err);
    }
  }

  async function onAudio({ file, durationMs }: { file: File; durationMs: number | null }) {
    const id = ++requestRef.current;
    setPhase("transcribing");
    setError(null);
    setReview(null);
    setExtraction(null);
    setAnnouncement("Transcribing your recording…");
    try {
      const response = await transcribe(file, durationMs);
      if (id !== requestRef.current) return;
      const info: TranscriptInfo = {
        text: response.transcript,
        languageLabel: capitalise(response.language),
        langAttr: langAttrFor(response.language),
        durationSec: response.durationSec,
        notice: response.notice,
      };
      setTranscript(info);
      await runExtraction(info, outputLanguage);
    } catch (err) {
      if (id === requestRef.current) fail(err);
    }
  }

  function onSample(id: SampleId) {
    const sample = SAMPLES.find((s) => s.id === id)!;
    const info: TranscriptInfo = {
      text: sample.transcript,
      languageLabel: sample.languageName,
      langAttr: sample.spokenLanguage,
      durationSec: sample.durationSec,
      sampleId: sample.id,
    };
    setTranscript(info);
    setReview(null);
    void runExtraction(info, outputLanguage);
  }

  function onOutputLanguage(lang: OutputLanguage) {
    setOutputLanguage(lang);
    if (transcript && review) {
      setAnnouncement(`Switching to ${lang === "de" ? "German" : "English"}: refilling the form, approvals reset.`);
      void runExtraction(transcript, lang);
    }
  }

  function update(next: ReviewState, message: string) {
    setReview(next);
    setCompletedAt(isComplete(next) ? new Date().toISOString() : null);
    setAnnouncement(
      isComplete(next) ? `${message} All fields approved: the final record is ready.` : message,
    );
  }

  const lang = extraction?.outputLanguage ?? outputLanguage;
  const notices = [transcript?.notice, extraction?.notice].filter(
    (n, i, all): n is Notice => !!n && all.findIndex((m) => m?.kind === n.kind) === i,
  );
  const label = (key: IncidentFieldKey) => FIELD_META[key].label[lang];
  const finalRecord =
    review && extraction && transcript && completedAt && isComplete(review)
      ? buildFinalRecord(review, {
          outputLanguage: lang,
          mode: transcript.notice ? "demo" : extraction.mode,
          sampleId: transcript.sampleId ?? null,
          transcript: transcript.text,
          language: transcript.languageLabel,
          completedAt,
        })
      : null;

  return (
    <div className="space-y-6">
      {status && (
        <p
          className={`rounded-lg border px-4 py-2 text-sm ${
            status.mode === "demo" ? "border-accent/50 text-text" : "border-border text-muted"
          }`}
          data-testid="server-mode"
        >
          {status.mode === "demo" ? (
            <>
              <span className="font-semibold text-accent">Demo mode.</span> This server has no API key, so
              recordings and uploads are answered with a recorded example. The samples work exactly as they
              would live.
            </>
          ) : (
            <>
              <span className="font-semibold text-text">Live.</span> Recordings are sent to Groq for
              transcription and extraction. Nothing is stored on this server.
            </>
          )}
        </p>
      )}

      <InputPanel
        busy={busy}
        outputLanguage={outputLanguage}
        onOutputLanguage={onOutputLanguage}
        onAudio={onAudio}
        onSample={onSample}
        onError={(message) => setError(message)}
      />

      <p role="status" aria-live="polite" className="sr-only" data-testid="live-region">
        {announcement}
      </p>

      {error && (
        <div role="alert" className="rounded-lg border border-bad/60 bg-bad/10 px-4 py-3 text-sm">
          <p className="font-semibold">That didn&apos;t work</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {busy && (
        <p className="text-sm text-muted" aria-hidden="true">
          {phase === "transcribing" ? "Transcribing…" : "Filling in the form…"}
        </p>
      )}

      {transcript && (
        <div className="space-y-4" aria-busy={busy}>
          <Notices notices={notices} />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="lg:sticky lg:top-4 lg:self-start">
              <TranscriptPanel
                transcript={transcript.text}
                languageLabel={transcript.languageLabel}
                langAttr={transcript.langAttr}
                durationSec={transcript.durationSec}
                activeSource={activeSource}
              />
            </div>

            {review && (
              <section aria-labelledby="review-heading" className="space-y-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="review-heading" className="text-lg font-semibold">
                    3. Review each field
                  </h2>
                  <p className="text-sm text-muted" data-testid="progress">
                    {approvedCount(review)} of {FIELD_KEYS.length} approved
                  </p>
                </div>
                <p className="text-sm text-muted">
                  The model drafted these from the transcript. Check each one against the words it came from,
                  then approve it or correct it.
                </p>
                {FIELD_KEYS.map((key) => (
                  <FieldCard
                    key={`${key}-${lang}`}
                    fieldKey={key}
                    review={review[key]}
                    lang={lang}
                    spokenLang={transcript.langAttr}
                    onFocusSource={setActiveSource}
                    onApprove={() => update(approve(review, key), `${label(key)} approved.`)}
                    onReopen={() => update(reopen(review, key), `${label(key)} reopened.`)}
                    onSave={(raw) => {
                      const result = saveEdit(review, key, raw);
                      if (!result.ok) {
                        setAnnouncement(`${label(key)} was not saved: ${result.errors.join("; ")}`);
                        return result.errors;
                      }
                      update(result.state, `${label(key)} saved and approved.`);
                      return null;
                    }}
                  />
                ))}
              </section>
            )}
          </div>
        </div>
      )}

      {finalRecord && <FinalRecord record={finalRecord} onAnnounce={setAnnouncement} />}
    </div>
  );
}
