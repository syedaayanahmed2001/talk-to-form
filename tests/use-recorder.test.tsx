// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_RECORDING_MS, useRecorder, type Recording } from "@/components/use-recorder";

class FakeMediaRecorder {
  static isTypeSupported = (type: string) => type === "audio/webm;codecs=opus";
  static instances: FakeMediaRecorder[] = [];
  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_stream: unknown, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? "";
    FakeMediaRecorder.instances.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["audio-bytes"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

function installMicrophone(getUserMedia: () => Promise<unknown>) {
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
}

const stream = { getTracks: () => [{ stop: vi.fn() }] };

describe("useRecorder", () => {
  beforeEach(() => {
    FakeMediaRecorder.instances = [];
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "mediaDevices");
  });

  it("[UI-01] stops by itself at 30 seconds and hands over the file with its duration", async () => {
    installMicrophone(async () => stream);
    const recordings: Recording[] = [];
    const { result } = renderHook(() => useRecorder((r) => recordings.push(r)));
    expect(result.current.supported).toBe(true);

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state.kind).toBe("recording");

    await act(async () => {
      vi.advanceTimersByTime(MAX_RECORDING_MS - 1000);
    });
    expect(recordings).toHaveLength(0);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(recordings).toHaveLength(1);
    expect(recordings[0].durationMs).toBeLessThanOrEqual(30_000);
    expect(recordings[0].file.type).toBe("audio/webm;codecs=opus");
    expect(recordings[0].file.name).toBe("recording.webm");
    expect(result.current.state.kind).toBe("idle");
  });

  it("[UI-01] can be stopped early", async () => {
    installMicrophone(async () => stream);
    const recordings: Recording[] = [];
    const { result } = renderHook(() => useRecorder((r) => recordings.push(r)));
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      vi.advanceTimersByTime(4000);
      result.current.stop();
    });
    expect(recordings[0].durationMs).toBe(4000);
  });

  it("[UI-09] reports a denied microphone", async () => {
    installMicrophone(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });
    const { result } = renderHook(() => useRecorder(() => {}));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toMatchObject({ kind: "denied" });
    expect(result.current.state.kind === "denied" && result.current.state.message).toMatch(/denied/);
  });

  it("[UI-09] reports when recording is not supported at all", () => {
    const { result } = renderHook(() => useRecorder(() => {}));
    expect(result.current.supported).toBe(false);
  });
});
