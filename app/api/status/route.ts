import { connection } from "next/server";
import { readConfig } from "@/lib/server/config";
import { handleStatus } from "@/lib/server/handlers";

export async function GET(): Promise<Response> {
  // With Cache Components a GET handler that touches no request data is prerendered at build
  // time. connection() defers it to request time, so adding a key takes effect without a rebuild.
  await connection();
  return handleStatus({ config: readConfig() });
}
