/**
 * Server configuration. The only module that reads the API key.
 * Never import this from a client component.
 */

export const LIMITS = {
  maxAudioSeconds: 30,
  /** Small allowance for encoder rounding: a 30.0 s recording may report 30.2 s. */
  durationToleranceSeconds: 0.5,
  /** Under Vercel's 4.5 MB request body limit. 30 s of Opus is about 0.5 MB. */
  maxUploadBytes: 4 * 1024 * 1024,
  /** Multipart boundaries and field headers on top of the file itself. */
  multipartOverheadBytes: 64 * 1024,
  maxTranscriptChars: 4000,
  rateLimit: { limit: 10, windowMs: 10 * 60 * 1000 },
  providerTimeoutMs: 25_000,
} as const;

export const DEFAULT_CHAT_MODEL = "openai/gpt-oss-120b";
export const DEFAULT_STT_MODEL = "whisper-large-v3-turbo";

export type ServerConfig = {
  apiKey: string | null;
  chatModel: string;
  sttModel: string;
};

export function readConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const apiKey = env.GROQ_API_KEY?.trim();
  return {
    apiKey: apiKey ? apiKey : null,
    chatModel: env.GROQ_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL,
    sttModel: env.GROQ_STT_MODEL?.trim() || DEFAULT_STT_MODEL,
  };
}
