import type { ErrorResponse } from "@/lib/api-types";

/**
 * Best-effort client IP. On Vercel the platform sets x-forwarded-for; its first entry is the
 * client. Anything without a usable header shares the "unknown" bucket.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const real = headers.get("x-real-ip")?.trim();
  return real || "unknown";
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  extra: { retryAfterSec?: number } = {},
): Response {
  const body: ErrorResponse = { error: { code, message, ...extra } };
  const headers: Record<string, string> = {};
  if (extra.retryAfterSec !== undefined) headers["Retry-After"] = String(extra.retryAfterSec);
  return Response.json(body, { status, headers });
}
