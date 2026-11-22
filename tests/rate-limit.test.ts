import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/server/rate-limit";
import { clientIp } from "@/lib/server/request";

describe("rate limiter", () => {
  function limiter() {
    let now = 1_000_000;
    const instance = createRateLimiter({ limit: 10, windowMs: 600_000, now: () => now });
    return { instance, advance: (ms: number) => (now += ms) };
  }

  it("[API-05] allows 10 requests per window and refuses the 11th with a retry time", () => {
    const { instance, advance } = limiter();
    for (let i = 0; i < 10; i++) expect(instance.take("1.2.3.4").allowed).toBe(true);
    advance(60_000);
    const refused = instance.take("1.2.3.4");
    expect(refused).toEqual({ allowed: false, retryAfterSec: 540 });
  });

  it("[API-05] keeps different keys independent", () => {
    const { instance } = limiter();
    for (let i = 0; i < 10; i++) instance.take("a");
    expect(instance.take("a").allowed).toBe(false);
    expect(instance.take("b").allowed).toBe(true);
  });

  it("[API-05] opens a fresh window once the old one has expired", () => {
    const { instance, advance } = limiter();
    for (let i = 0; i < 11; i++) instance.take("a");
    advance(600_000);
    expect(instance.take("a")).toEqual({ allowed: true, remaining: 9 });
  });

  it("[API-05] never asks to wait less than one second", () => {
    const { instance, advance } = limiter();
    for (let i = 0; i < 10; i++) instance.take("a");
    advance(599_999);
    expect(instance.take("a")).toEqual({ allowed: false, retryAfterSec: 1 });
  });

  it("[API-05] takes the client IP from the first x-forwarded-for entry", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
