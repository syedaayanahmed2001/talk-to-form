import { z } from "zod";
import type { ExtractResponse, StatusResponse, TranscribeResponse } from "@/lib/api-types";
import { SAMPLE_IDS, getSample, matchSample } from "@/lib/demo/samples";
import { extractIncident } from "@/lib/extract/pipeline";
import { OUTPUT_LANGUAGES } from "@/lib/incident/fields";
import { isCalendarDate } from "@/lib/incident/schema";
import { isTransientProviderError, ProviderError, type Provider } from "@/lib/provider/types";
import { LIMITS, type ServerConfig } from "./config";
import { DEFAULT_SAMPLE, NOTICES, demoExtraction, demoTranscription } from "./demo";
import type { RateLimiter } from "./rate-limit";
import { clientIp, jsonError } from "./request";

/**
 * Route logic as plain functions with injected dependencies, so tests can drive every branch
 * without a server, a key or the network. app/api/*\/route.ts only wires the defaults.
 */
export type Deps = {
  config: ServerConfig;
  limiter: RateLimiter;
  /** Builds the live provider; only called when a key is configured. */
  createProvider: (config: ServerConfig & { apiKey: string }) => Provider;
  today: () => string;
};

const AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/flac",
  "audio/x-flac",
  "video/webm",
  "video/mp4",
]);
const AUDIO_EXTENSIONS = /\.(webm|ogg|oga|opus|mp3|mpeg|mpga|mp4|m4a|wav|flac)$/i;

function isSupportedAudio(file: File): boolean {
  const base = file.type.split(";")[0].trim().toLowerCase();
  if (AUDIO_TYPES.has(base)) return true;
  // Some browsers send an empty or generic type for picked files; fall back to the extension.
  return (base === "" || base === "application/octet-stream") && AUDIO_EXTENSIONS.test(file.name);
}

const maxSeconds = LIMITS.maxAudioSeconds + LIMITS.durationToleranceSeconds;

function tooLong(): Response {
  return jsonError(400, "audio_too_long", `Recordings can be at most ${LIMITS.maxAudioSeconds} seconds long.`);
}

function rateLimited(retryAfterSec: number): Response {
  const minutes = Math.ceil(retryAfterSec / 60);
  return jsonError(
    429,
    "rate_limited",
    `You have reached the demo limit. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}, ` +
      "or pick one of the recorded samples.",
    { retryAfterSec },
  );
}

function providerFailed(error: unknown): Response {
  // The message is logged server-side (the key is redacted in it); the client gets a plain one.
  console.error("[provider]", error instanceof Error ? error.message : error);
  return jsonError(502, "provider_error", "The speech service could not process this request.");
}

function liveProvider(deps: Deps): Provider | null {
  const { apiKey } = deps.config;
  return apiKey ? deps.createProvider({ ...deps.config, apiKey }) : null;
}

// ---------------------------------------------------------------------------------------------

export async function handleTranscribe(request: Request, deps: Deps): Promise<Response> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > LIMITS.maxUploadBytes + LIMITS.multipartOverheadBytes) {
    return jsonError(413, "upload_too_large", "The file is larger than 4 MB.");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "invalid_form", "Send the audio as multipart form data.");
  }

  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return jsonError(400, "missing_audio", "No audio file was sent.");
  }
  if (audio.size > LIMITS.maxUploadBytes) {
    return jsonError(413, "upload_too_large", "The file is larger than 4 MB.");
  }
  if (!isSupportedAudio(audio)) {
    return jsonError(400, "unsupported_audio", "Use webm, ogg, mp3, m4a, mp4, wav or flac audio.");
  }

  const reportedMs = Number(form.get("durationMs"));
  if (Number.isFinite(reportedMs) && reportedMs > maxSeconds * 1000) return tooLong();

  const provider = liveProvider(deps);
  if (!provider) return Response.json(demoTranscription(DEFAULT_SAMPLE, NOTICES.noKey(DEFAULT_SAMPLE)));

  const decision = deps.limiter.take(`transcribe:${clientIp(request.headers)}`);
  if (!decision.allowed) return rateLimited(decision.retryAfterSec);

  let transcription;
  try {
    transcription = await provider.transcribe({ audio, filename: audio.name || "recording.webm" });
  } catch (error) {
    if (isTransientProviderError(error)) {
      return Response.json(demoTranscription(DEFAULT_SAMPLE, NOTICES.providerUnavailable(DEFAULT_SAMPLE)));
    }
    return providerFailed(error);
  }

  if (transcription.durationSec !== null && transcription.durationSec > maxSeconds) return tooLong();
  if (transcription.text.length === 0) {
    return jsonError(422, "no_speech", "No speech was recognised in this recording.");
  }

  const body: TranscribeResponse = {
    transcript: transcription.text.slice(0, LIMITS.maxTranscriptChars),
    language: transcription.language,
    durationSec: transcription.durationSec,
    mode: "live",
  };
  return Response.json(body);
}

// ---------------------------------------------------------------------------------------------

const extractBody = z.object({
  transcript: z
    .string({ error: "transcript is required" })
    .trim()
    .min(1, "transcript must not be empty")
    .max(LIMITS.maxTranscriptChars, `transcript must be at most ${LIMITS.maxTranscriptChars} characters`),
  outputLanguage: z.enum(OUTPUT_LANGUAGES as ["de", "en"], {
    error: "outputLanguage must be 'de' or 'en'",
  }),
  referenceDate: z
    .string()
    .refine(isCalendarDate, "referenceDate must be a date in the form YYYY-MM-DD")
    .optional(),
  sampleId: z.enum(SAMPLE_IDS, { error: "unknown sampleId" }).optional(),
});

export async function handleExtract(request: Request, deps: Deps): Promise<Response> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "The request body must be JSON.");
  }

  const parsed = extractBody.safeParse(json);
  if (!parsed.success) {
    return jsonError(400, "invalid_request", parsed.error.issues.map((i) => i.message).join("; "));
  }
  const { transcript, outputLanguage, referenceDate, sampleId } = parsed.data;

  // Picked samples are always replayed: no key needed, no limit counted.
  if (sampleId) {
    const sample = getSample(sampleId);
    return Response.json(await demoExtraction(sample, outputLanguage, NOTICES.sample(sample)));
  }

  const provider = liveProvider(deps);
  if (!provider) {
    const sample = matchSample(transcript) ?? DEFAULT_SAMPLE;
    return Response.json(await demoExtraction(sample, outputLanguage, NOTICES.noKey(sample)));
  }

  const decision = deps.limiter.take(`extract:${clientIp(request.headers)}`);
  if (!decision.allowed) return rateLimited(decision.retryAfterSec);

  try {
    const result = await extractIncident(
      { transcript, outputLanguage, referenceDate: referenceDate ?? deps.today() },
      provider,
    );
    const body: ExtractResponse = { result, transcript, outputLanguage, mode: "live" };
    return Response.json(body);
  } catch (error) {
    if (isTransientProviderError(error)) {
      const sample = matchSample(transcript) ?? DEFAULT_SAMPLE;
      return Response.json(
        await demoExtraction(sample, outputLanguage, NOTICES.providerUnavailable(sample)),
      );
    }
    if (error instanceof ProviderError) return providerFailed(error);
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------

export function handleStatus(deps: Pick<Deps, "config">): Response {
  const body: StatusResponse = {
    mode: deps.config.apiKey ? "live" : "demo",
    maxAudioSeconds: LIMITS.maxAudioSeconds,
    maxUploadBytes: LIMITS.maxUploadBytes,
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
