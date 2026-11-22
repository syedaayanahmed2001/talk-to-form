// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { computeAccessibleName } from "dom-accessibility-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TalkToForm } from "@/components/talk-to-form";
import type { ExtractResponse } from "@/lib/api-types";
import { SAMPLES } from "@/lib/demo/samples";
import { FIELD_KEYS } from "@/lib/incident/schema";
import { LIMITS } from "@/lib/server/config";
import { handleExtract, type Deps } from "@/lib/server/handlers";
import { createRateLimiter } from "@/lib/server/rate-limit";
import { validRecord } from "./helpers";

/**
 * The page against the real extract handler in demo mode (no key), with fetch routed in
 * memory. Overrides let a test answer a route itself.
 */
const demoDeps: Deps = {
  config: { apiKey: null, chatModel: "m", sttModel: "s" },
  limiter: createRateLimiter(LIMITS.rateLimit),
  createProvider: () => {
    throw new Error("no live provider in UI tests");
  },
  today: () => "2026-11-22",
};

type Sent = { url: string; body: unknown };
let sent: Sent[] = [];
let overrides: Record<string, () => Response> = {};

function installFetch() {
  sent = [];
  overrides = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = String(input);
      const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
      sent.push({ url, body });
      if (overrides[url]) return overrides[url]();
      if (url === "/api/status") return Response.json({ mode: "demo", maxAudioSeconds: 30, maxUploadBytes: 4194304 });
      if (url === "/api/extract") {
        return handleExtract(
          new Request(`http://test${url}`, { method: "POST", body: init.body as string, headers: { "content-type": "application/json" } }),
          demoDeps,
        );
      }
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
}

async function pickSample(user: ReturnType<typeof userEvent.setup>, languageName: string) {
  await user.click(screen.getByRole("button", { name: new RegExp(languageName) }));
  await screen.findByRole("heading", { name: "3. Review each field" });
}

function card(fieldTitle: string): HTMLElement {
  return screen.getByRole("article", { name: fieldTitle });
}

async function approveAll(user: ReturnType<typeof userEvent.setup>) {
  const buttons = screen.getAllByRole("button", { name: /^Approve / });
  for (const button of buttons) await user.click(button);
}

describe("talk-to-form page", () => {
  beforeEach(installFetch);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "mediaDevices");
  });

  it("[UI-01] [DEMO-04] picking a sample sends its id and labels the result as a recorded example", async () => {
    const user = userEvent.setup();
    render(<TalkToForm />);
    expect(await screen.findByTestId("server-mode")).toHaveTextContent("Demo mode");
    await pickSample(user, "Hindi");

    const extractCall = sent.find((s) => s.url === "/api/extract")!;
    expect(extractCall.body).toMatchObject({ sampleId: "workshop-hi", outputLanguage: "de" });
    const notices = screen.getByTestId("notices");
    expect(notices).toHaveTextContent("Recorded example");
    // Next to the result: the notice directly precedes the transcript/form grid.
    expect(notices.nextElementSibling).toContainElement(screen.getByTestId("transcript"));
  });

  it("[UI-02] [UI-03] shows the transcript beside nine field cards with value, source and confidence", async () => {
    const user = userEvent.setup();
    render(<TalkToForm />);
    await pickSample(user, "Turkish");
    const sample = SAMPLES.find((s) => s.spokenLanguage === "tr")!;
    expect(screen.getByTestId("transcript")).toHaveTextContent(sample.transcript.slice(0, 40));
    expect(screen.getByTestId("transcript")).toHaveAttribute("lang", "tr");

    expect(screen.getAllByRole("article")).toHaveLength(FIELD_KEYS.length);
    const location = card("Ort");
    expect(location).toHaveTextContent("Laderampe von Lager B");
    expect(location).toHaveTextContent("B deposunun yükleme rampasında");
    expect(location).toHaveTextContent("High confidence");
    expect(within(card("Uhrzeit")).getByText("Medium confidence")).toBeInTheDocument();
    // Per-field approval only: nine Approve buttons, no bulk control.
    expect(screen.getAllByRole("button", { name: /^Approve / })).toHaveLength(9);
    expect(screen.queryByRole("button", { name: /approve all/i })).toBeNull();
  });

  it("[UI-02] focusing a field highlights its source in the transcript", async () => {
    const user = userEvent.setup();
    render(<TalkToForm />);
    await pickSample(user, "Arabic");
    within(card("Zeugen")).getByRole("button", { name: /^Approve/ }).focus();
    await waitFor(() =>
      expect(screen.getByTestId("transcript").querySelector("mark")).toHaveTextContent("رأت الحادث أيضاً زميلتنا نور خليل"),
    );
  });

  it("[UI-05] [UI-07] the final record appears only after all nine approvals, and goes away on reopen", async () => {
    const user = userEvent.setup();
    render(<TalkToForm />);
    await pickSample(user, "Hindi");

    const buttons = screen.getAllByRole("button", { name: /^Approve / });
    for (const button of buttons.slice(0, 8)) await user.click(button);
    expect(screen.queryByTestId("final-record")).toBeNull();
    expect(screen.getByTestId("progress")).toHaveTextContent("8 of 9 approved");

    await user.click(buttons[8]);
    const final = await screen.findByTestId("final-record");
    expect(screen.getByTestId("live-region")).toHaveTextContent("final record is ready");
    const json = JSON.parse(within(final).getByTestId("final-json").textContent!);
    expect(json.format).toBe("talk-to-form/incident-report");
    expect(json.mode).toBe("demo");
    expect(Object.values(json.fields).every((f) => (f as { approved: boolean }).approved)).toBe(true);
    const printable = within(final).getByRole("article", { name: "Printable view" });
    expect(printable).toHaveTextContent("Meldung eines Vorfalls am Arbeitsplatz");
    expect(printable).toHaveTextContent("Keine (ausdrücklich genannt)");
    expect(within(final).getByRole("link", { name: "Download JSON" })).toHaveAttribute("download");

    await user.click(within(card("Hergang")).getByRole("button", { name: /^Reopen/ }));
    expect(screen.queryByTestId("final-record")).toBeNull();
  });

  it("[UI-03] an invalid edit is rejected with the schema message; a valid one is marked Edited", async () => {
    const user = userEvent.setup();
    render(<TalkToForm />);
    await pickSample(user, "Turkish");

    await user.click(within(card("Ort")).getByRole("button", { name: /^Edit/ }));
    const input = within(card("Ort")).getByLabelText("Ort");
    await user.clear(input);
    await user.click(within(card("Ort")).getByRole("button", { name: /^Save and approve/ }));
    expect(within(card("Ort")).getByRole("alert")).toHaveTextContent("Must not be empty");

    await user.type(input, "Rampe 2, Lager B");
    await user.click(within(card("Ort")).getByRole("button", { name: /^Save and approve/ }));
    expect(card("Ort")).toHaveTextContent("Edited");
    expect(card("Ort")).toHaveTextContent("Approved");
    expect(card("Ort")).toHaveTextContent("Rampe 2, Lager B");
  });

  it("[UI-04] a failing field cannot be approved until a valid value is saved", async () => {
    const { date: _drop, ...fields } = validRecord();
    void _drop;
    const response: ExtractResponse = {
      result: { fields, failures: [{ field: "date", path: "date.value", message: "Use the format YYYY-MM-DD" }], warnings: [], attempts: 2 },
      transcript: SAMPLES[0].transcript,
      outputLanguage: "en",
      mode: "live",
    };
    overrides["/api/extract"] = () => Response.json(response);
    const user = userEvent.setup();
    render(<TalkToForm />);
    await user.click(screen.getByRole("radio", { name: "English" }));
    await pickSample(user, "Turkish");

    const date = card("Date");
    expect(date).toHaveTextContent("Needs a value");
    expect(date).toHaveTextContent("Use the format YYYY-MM-DD");
    expect(within(date).getByRole("button", { name: /^Approve/ })).toBeDisabled();

    await user.click(within(date).getByRole("button", { name: /^Fill in/ }));
    await user.type(within(date).getByLabelText("Date"), "2026-11-17");
    await user.click(within(date).getByRole("button", { name: /^Save and approve/ }));
    expect(card("Date")).toHaveTextContent("Approved");
  });

  it("[UI-06] switching the output language re-runs extraction and resets approvals", async () => {
    const user = userEvent.setup();
    render(<TalkToForm />);
    await pickSample(user, "Arabic");
    await user.click(within(card("Ort")).getByRole("button", { name: /^Approve/ }));
    expect(card("Ort")).toHaveTextContent("Approved");

    await user.click(screen.getByRole("radio", { name: "English" }));
    await screen.findByRole("article", { name: "Location" });
    const calls = sent.filter((s) => s.url === "/api/extract");
    expect(calls).toHaveLength(2);
    expect(calls[1].body).toMatchObject({ outputLanguage: "en", sampleId: "kitchen-ar" });
    expect(card("Location")).toHaveTextContent("Waiting for review");
    expect(card("What happened")).toHaveTextContent("boiling water");
    expect(screen.getByTestId("progress")).toHaveTextContent("0 of 9 approved");
  });

  it("[UI-07] every control has an accessible name and status changes are announced", async () => {
    const user = userEvent.setup();
    render(<TalkToForm />);
    await pickSample(user, "Hindi");
    expect(screen.getByTestId("live-region")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByTestId("live-region")).toHaveTextContent("Form filled. 9 fields to review.");
    await user.click(within(card("Ort")).getByRole("button", { name: /^Edit/ }));
    await approveAll(user);

    const controls = document.querySelectorAll("button, input, select, textarea, a[href], pre[tabindex]");
    expect(controls.length).toBeGreaterThan(20);
    for (const control of controls) {
      expect(computeAccessibleName(control).trim(), control.outerHTML.slice(0, 120)).not.toBe("");
    }
  });

  it("[UI-09] without a microphone API, says so and keeps upload and samples usable", async () => {
    render(<TalkToForm />);
    expect(await screen.findByTestId("mic-message")).toHaveTextContent("can't record audio");
    expect(screen.getByRole("button", { name: "Record (max 30 s)" })).toBeDisabled();
    expect(screen.getByLabelText("Upload an audio file")).toBeEnabled();
    for (const sample of SAMPLES) {
      expect(screen.getByRole("button", { name: new RegExp(sample.languageName) })).toBeEnabled();
    }
  });

  it("[UI-09] a denied microphone shows an alert and keeps upload and samples usable", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: async () => Promise.reject(new DOMException("no", "NotAllowedError")) },
      configurable: true,
    });
    vi.stubGlobal("MediaRecorder", class {});
    const user = userEvent.setup();
    render(<TalkToForm />);
    await user.click(screen.getByRole("button", { name: "Record (max 30 s)" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Microphone access was denied");
    expect(screen.getByLabelText("Upload an audio file")).toBeEnabled();
    expect(screen.getByRole("button", { name: /Turkish/ })).toBeEnabled();
  });

  it("[UI-01] [DEMO-04] an upload is posted as multipart audio; in demo mode the no-key notice is shown", async () => {
    const sample = SAMPLES[0];
    overrides["/api/transcribe"] = () =>
      Response.json({
        transcript: sample.transcript,
        language: "turkish",
        durationSec: sample.durationSec,
        mode: "demo",
        sampleId: sample.id,
        notice: { kind: "no-key", message: "Demo mode: this server has no API key, so you are seeing a recorded example." },
      });
    const user = userEvent.setup();
    render(<TalkToForm />);
    const file = new File([new Uint8Array(1000)], "clip.webm", { type: "audio/webm" });
    await user.upload(screen.getByLabelText("Upload an audio file"), file);
    await screen.findByRole("heading", { name: "3. Review each field" });

    const upload = sent.find((s) => s.url === "/api/transcribe")!;
    expect(upload.body).toBeInstanceOf(FormData);
    expect(((upload.body as FormData).get("audio") as File).name).toBe("clip.webm");
    expect(screen.getByTestId("notices")).toHaveTextContent("no API key");
  });

  it("[UI-01] rejects a file over 4 MB in the browser without uploading it", async () => {
    const user = userEvent.setup();
    render(<TalkToForm />);
    const big = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "big.wav", { type: "audio/wav" });
    await user.upload(screen.getByLabelText("Upload an audio file"), big);
    expect(await screen.findByRole("alert")).toHaveTextContent("larger than 4 MB");
    expect(sent.some((s) => s.url === "/api/transcribe")).toBe(false);
  });

  it("[API-05] a server-side rate limit is shown as a readable message", async () => {
    overrides["/api/extract"] = () =>
      Response.json(
        { error: { code: "rate_limited", message: "You have reached the demo limit. Try again in about 9 minutes." } },
        { status: 429 },
      );
    const user = userEvent.setup();
    render(<TalkToForm />);
    await user.click(screen.getByRole("button", { name: /Hindi/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("demo limit");
  });
});
