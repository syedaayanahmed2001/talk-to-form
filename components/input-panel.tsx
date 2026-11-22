"use client";

import { useId } from "react";
import { SAMPLES, type SampleId } from "@/lib/demo/samples";
import type { OutputLanguage } from "@/lib/incident/fields";
import { MAX_RECORDING_MS, useRecorder, type Recording } from "./use-recorder";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Best-effort duration of a picked file. Unknown (null) if the browser can't decode it. */
function probeDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof Audio === "undefined") return resolve(null);
    const audio = new Audio();
    if (file.type && audio.canPlayType(file.type) === "") return resolve(null);
    const url = URL.createObjectURL(file);
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => done(null), 3000);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      clearTimeout(timer);
      done(Number.isFinite(audio.duration) ? audio.duration * 1000 : null);
    };
    audio.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
    audio.src = url;
  });
}

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `0:${String(s).padStart(2, "0")}`;
}

export function InputPanel({
  busy,
  outputLanguage,
  onOutputLanguage,
  onAudio,
  onSample,
  onError,
}: {
  busy: boolean;
  outputLanguage: OutputLanguage;
  onOutputLanguage: (lang: OutputLanguage) => void;
  onAudio: (recording: { file: File; durationMs: number | null }) => void;
  onSample: (id: SampleId) => void;
  onError: (message: string) => void;
}) {
  const recorder = useRecorder((recording: Recording) => onAudio(recording));
  const uploadId = useId();
  const recording = recorder.state.kind === "recording";

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      onError("That file is larger than 4 MB. Please use a shorter clip.");
      return;
    }
    const durationMs = await probeDuration(file);
    if (durationMs !== null && durationMs > MAX_RECORDING_MS + 500) {
      onError("That recording is longer than 30 seconds. Please use a shorter clip.");
      return;
    }
    onAudio({ file, durationMs });
  }

  return (
    <section aria-labelledby="input-heading" className="space-y-5 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="input-heading" className="text-lg font-semibold">
          1. Speak, upload or pick a sample
        </h2>
        <fieldset className="flex items-center gap-1 text-sm">
          <legend className="sr-only">Write the report in</legend>
          <span aria-hidden="true" className="mr-1 text-muted">
            Report in
          </span>
          {(["de", "en"] as const).map((lang) => (
            <label
              key={lang}
              className={`cursor-pointer rounded border px-3 py-1.5 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                outputLanguage === lang ? "border-accent bg-accent/15 text-text" : "border-border text-muted"
              }`}
            >
              <input
                type="radio"
                name="output-language"
                value={lang}
                checked={outputLanguage === lang}
                onChange={() => onOutputLanguage(lang)}
                disabled={busy}
                className="sr-only"
              />
              {lang === "de" ? "Deutsch" : "English"}
            </label>
          ))}
        </fieldset>
      </div>

      <p className="text-sm text-muted">
        Describe what happened, in any language, in up to 30 seconds: when, where, who was involved, any
        injuries, what was done right away, who saw it, and what still needs doing.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          {recording ? (
            <button type="button" onClick={recorder.stop} className="btn-primary w-full">
              Stop recording
            </button>
          ) : (
            <button
              type="button"
              onClick={recorder.start}
              disabled={busy || !recorder.supported || recorder.state.kind === "requesting"}
              className="btn-primary w-full"
            >
              {recorder.state.kind === "requesting" ? "Waiting for the microphone…" : "Record (max 30 s)"}
            </button>
          )}
          {recording && (
            <div className="space-y-1">
              <progress
                max={MAX_RECORDING_MS}
                value={recorder.state.kind === "recording" ? recorder.state.elapsedMs : 0}
                aria-label="Recording time"
                className="h-2 w-full accent-accent"
              />
              <p className="text-sm tabular-nums text-muted">
                Recording {clock(recorder.state.kind === "recording" ? recorder.state.elapsedMs : 0)} / 0:30 ·
                stops by itself at 30 s
              </p>
            </div>
          )}
          {!recorder.supported && (
            <p className="text-sm text-warn" data-testid="mic-message">
              This browser can&apos;t record audio here. You can still upload a file or pick a sample.
            </p>
          )}
          {recorder.state.kind === "denied" && (
            <p role="alert" className="text-sm text-warn" data-testid="mic-message">
              {recorder.state.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor={uploadId} className="btn-secondary block w-full cursor-pointer text-center has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
            Upload an audio file
            <input
              id={uploadId}
              type="file"
              accept="audio/*,.webm,.m4a,.mp3,.wav,.ogg,.flac"
              onChange={onFile}
              disabled={busy}
              className="sr-only"
            />
          </label>
          <p className="text-sm text-muted">Up to 30 seconds and 4 MB: webm, ogg, mp3, m4a, wav or flac.</p>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Or try a recorded sample</h3>
        <ul className="grid gap-2 md:grid-cols-3">
          {SAMPLES.map((sample) => (
            <li key={sample.id}>
              <button
                type="button"
                onClick={() => onSample(sample.id)}
                disabled={busy}
                className="h-full w-full rounded border border-border bg-bg px-3 py-2 text-left hover:border-muted disabled:opacity-50"
              >
                <span className="block text-sm font-medium">
                  <span lang={sample.spokenLanguage}>{sample.nativeName}</span>
                  <span className="text-muted"> · {sample.languageName}</span>
                </span>
                <span className="block text-sm text-muted">{sample.title.en}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
