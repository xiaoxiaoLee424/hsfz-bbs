import {visibleContent} from "@/lib/content-policy";
import { getCurrentUser } from "@/lib/auth";
import { getAttachment, getAttachmentStorage } from "@/lib/attachments";
import { allowAction } from "@/lib/ratelimit";
import { clientIpFromHeaders } from "@/lib/client-ip";
import { open } from "node:fs/promises";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";

function notFound() {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[a-f0-9]{32}$/.test(id)) return notFound();

  // Authorize from metadata before reading private files or accepting a cached response.
  const attachment = getAttachment(id);
  if (!attachment) return notFound();
  const user = await getCurrentUser();
  if (!user && (attachment.boardSlug !== "announcements" || attachment.replyId !== 0)) return notFound();
  if (!visibleContent(user,attachment.threadId,attachment.replyId)) return notFound();
  const rate = allowAction(`attachment-read:${user ? `user:${user.id}` : `guest:${clientIpFromHeaders(request.headers)}`}`, 60_000, 60);
  if (!rate.ok) return new Response("请求过于频繁，请稍后再试", { status: 429, headers: {
    "Cache-Control": "private, no-store", "Retry-After": String(rate.retryAfterSec),
  } });

  let storage: ReturnType<typeof getAttachmentStorage>;
  try {
    storage = getAttachmentStorage(id);
  } catch {
    return notFound();
  }
  if (!storage) return notFound();
  const preview = attachment.kind === "pdf" && new URL(request.url).searchParams.get("preview") === "1";
  // RFC 5987 preserves Chinese names; the ASCII fallback is never user controlled.
  const encodedName = encodeURIComponent(attachment.name).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
  const acceptsGzip = (request.headers.get("accept-encoding") ?? "").split(",").some((part) => {
    const [encoding, ...parameters] = part.trim().toLowerCase().split(";");
    const quality = parameters.find((parameter) => parameter.trim().startsWith("q="))?.trim().slice(2);
    return encoding === "gzip" && (quality === undefined || Number(quality) > 0);
  });
  const encoded = storage.encoding === "gzip" && acceptsGzip;
  const etag = `"${storage.hash}${encoded ? "-gzip" : ""}"`;
  const headers = new Headers({
      "Content-Type": attachment.kind === "pdf" ? "application/pdf" : "application/octet-stream",
      "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="attachment${attachment.kind === "pdf" ? ".pdf" : ""}"; filename*=UTF-8''${encodedName}`,
      // A browser may retain bytes, but every reuse must pass authorization and revalidation.
      "Cache-Control": "private, no-cache",
      "ETag": etag,
      "Vary": "Cookie, Accept-Encoding",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox",
  });
  if ((request.headers.get("if-none-match") ?? "").split(",").some((value) => {
    const tag = value.trim().replace(/^W\//, "");
    return tag === "*" || tag === etag;
  })) return new Response(null, { status: 304, headers });

  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    file = await open(storage.path, "r");
    const stat = await file.stat();
    if (!stat.isFile() || stat.size !== storage.storedSize) {
      await file.close();
      return notFound();
    }
  } catch {
    await file?.close().catch(() => {});
    return notFound();
  }

  let start = 0;
  let end = storage.size - 1;
  let status = 200;
  if (storage.encoding === "raw") {
    headers.set("Accept-Ranges", "bytes");
    const range = request.method === "HEAD" ? null : request.headers.get("range");
    const ifRange = request.headers.get("if-range");
    if (range && (!ifRange || ifRange === etag)) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match && (match[1] || match[2])) {
        const requestedStart = match[1] ? Number(match[1]) : Math.max(0, storage.size - Number(match[2]));
        const requestedEnd = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
        if (!Number.isSafeInteger(requestedStart) || !Number.isSafeInteger(requestedEnd) ||
            requestedStart > requestedEnd || requestedStart >= storage.size || (!match[1] && Number(match[2]) === 0)) {
          await file.close();
          headers.set("Content-Range", `bytes */${storage.size}`);
          return new Response(null, { status: 416, headers });
        }
        start = requestedStart;
        end = requestedEnd;
        status = 206;
        headers.set("Content-Range", `bytes ${start}-${end}/${storage.size}`);
      }
    }
  }
  if (encoded) headers.set("Content-Encoding", "gzip");
  headers.set("Content-Length", String(encoded ? storage.storedSize : status === 206 ? end - start + 1 : storage.size));
  if (request.method === "HEAD") {
    await file.close();
    return new Response(null, { status, headers });
  }
  const source = file.createReadStream(storage.encoding === "raw" ? { start, end } : undefined);
  // Usually send stored gzip directly; non-gzip clients receive a streaming decompression.
  const stream = storage.encoding === "gzip" && !encoded ? source.pipe(createGunzip()) : source;
  if (stream !== source) {
    source.on("error", (error) => stream.destroy(error));
    stream.on("close", () => source.destroy());
  }
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status, headers });
}
