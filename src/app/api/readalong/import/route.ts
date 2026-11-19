import { handleImport } from "../../../../../reading/server/import.mjs";

export const runtime = "nodejs";
export const maxDuration = 20;
// The original extractor only accepts two explicit public hosts, rejects
// redirects, bounds response size, and checks the request's same-site origin.
export async function POST(request: Request) {
  return handleImport(request);
}
