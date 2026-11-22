import { defaultDeps } from "@/lib/server/default-deps";
import { handleTranscribe } from "@/lib/server/handlers";

// Transcription of a 30 s clip takes a few seconds; leave room for one slow free-tier answer.
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return handleTranscribe(request, defaultDeps());
}
