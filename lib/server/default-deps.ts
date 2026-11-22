import { createGroqProvider } from "@/lib/provider/groq";
import { LIMITS, readConfig } from "./config";
import type { Deps } from "./handlers";
import { createRateLimiter } from "./rate-limit";

// One limiter per server instance, shared by both POST routes (keys are prefixed per route).
const limiter = createRateLimiter(LIMITS.rateLimit);

/** Production wiring: config read per request, so a key added in Vercel applies on next request. */
export function defaultDeps(): Deps {
  return {
    config: readConfig(),
    limiter,
    createProvider: (config) =>
      createGroqProvider({
        apiKey: config.apiKey,
        chatModel: config.chatModel,
        sttModel: config.sttModel,
        timeoutMs: LIMITS.providerTimeoutMs,
      }),
    today: () => new Date().toISOString().slice(0, 10),
  };
}
