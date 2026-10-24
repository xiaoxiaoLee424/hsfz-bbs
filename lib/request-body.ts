/** Bound the stream as well as Content-Length before parsing multipart/JSON. */
export async function boundedBody(
  request: Request,
  limit: number,
): Promise<Buffer> {
  if (Number(request.headers.get("content-length")) > limit)
    throw new Error("请求体过大");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("请求体为空");
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error("请求体过大");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export async function boundedForm(request: Request, limit: number) {
  const bytes = await boundedBody(request, limit);
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": request.headers.get("content-type") || "" },
  }).formData();
}
