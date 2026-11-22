"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export const MAX_RECORDING_MS = 30_000;

const PREFERRED_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

export type RecorderState =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "recording"; startedAt: number; elapsedMs: number }
  | { kind: "denied"; message: string };

function noSubscription(): () => void {
  return () => {};
}

export type Recording = { file: File; durationMs: number };

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }
  return PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

function extensionFor(type: string): string {
  if (type.includes("mp4")) return "m4a";
  if (type.includes("ogg")) return "ogg";
  return "webm";
}

export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}

/**
 * Microphone recording with a hard 30-second stop. The limit is enforced here (the visitor
 * never uploads more) and again on the server.
 */
export function useRecorder(onRecorded: (recording: Recording) => void) {
  const [state, setState] = useState<RecorderState>({ kind: "idle" });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timersRef = useRef<{ stop?: ReturnType<typeof setTimeout>; tick?: ReturnType<typeof setInterval> }>({});
  const onRecordedRef = useRef(onRecorded);

  useEffect(() => {
    onRecordedRef.current = onRecorded;
  }, [onRecorded]);

  const clearTimers = useCallback(() => {
    clearTimeout(timersRef.current.stop);
    clearInterval(timersRef.current.tick);
    timersRef.current = {};
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const start = useCallback(async () => {
    if (!isRecordingSupported()) return;
    setState({ kind: "requesting" });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      setState({
        kind: "denied",
        message: denied
          ? "Microphone access was denied. You can still upload a file or pick a sample."
          : "No microphone could be opened. You can still upload a file or pick a sample.",
      });
      return;
    }

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    const chunks: Blob[] = [];
    const startedAt = Date.now();

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      clearTimers();
      stream.getTracks().forEach((track) => track.stop());
      const durationMs = Math.min(Date.now() - startedAt, MAX_RECORDING_MS);
      const type = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunks, { type });
      recorderRef.current = null;
      setState({ kind: "idle" });
      if (blob.size > 0) {
        onRecordedRef.current({
          file: new File([blob], `recording.${extensionFor(type)}`, { type }),
          durationMs,
        });
      }
    };

    recorder.start();
    setState({ kind: "recording", startedAt, elapsedMs: 0 });
    timersRef.current.stop = setTimeout(stop, MAX_RECORDING_MS);
    timersRef.current.tick = setInterval(() => {
      setState((current) =>
        current.kind === "recording" ? { ...current, elapsedMs: Date.now() - current.startedAt } : current,
      );
    }, 250);
  }, [clearTimers, stop]);

  useEffect(
    () => () => {
      clearTimers();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
    },
    [clearTimers],
  );

  // Server render assumes support; the client snapshot corrects it during hydration.
  const supported = useSyncExternalStore(noSubscription, isRecordingSupported, () => true);

  return { state, supported, start, stop };
}
