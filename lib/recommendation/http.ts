export function sameOrigin(request: Request) {
  // Next may construct an internal HTTP URL behind a TLS reverse proxy. The
  // preserved Host header names the public origin; do not trust forwarded-host.
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    const host = request.headers.get("host") ?? new URL(request.url).host;
    return ["http:","https:"].includes(origin.protocol) && origin.host === host.toLowerCase();
  } catch { return false; }
}
export async function boundedJson(request: Request, maximum = 8192): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("JSON required");
  if (Number(request.headers.get("content-length")) > maximum) throw new Error("Request too large");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = []; let size=0;
  while (true) {
    const {done,value} = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size>maximum) { await reader.cancel(); throw new Error("Request too large"); }
    chunks.push(value);
  }
  const merged = new Uint8Array(size); let at=0;
  for (const chunk of chunks) { merged.set(chunk,at); at+=chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(merged));
}
