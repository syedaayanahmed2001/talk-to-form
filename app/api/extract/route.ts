import { defaultDeps } from "@/lib/server/default-deps";
import { handleExtract } from "@/lib/server/handlers";

// Up to two model calls (answer + one repair), each with a 25 s timeout.
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return handleExtract(request, defaultDeps());
}
