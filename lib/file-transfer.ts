// Shared limits; no Node dependencies, so the same policy runs in the browser.
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
// Incompressible files can gain a small gzip header/block overhead.
export const MAX_COMPRESSED_BYTES = MAX_FILE_BYTES + 64 * 1024;
export const ATTACHMENT_TTL_MS = 10 * 60 * 1000;

export type AttachmentInfo = {
  id: string;
  filename: string;
  original_size: number;
  compressed_size: number;
  expires_at: number;
};

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function readLimitedStream(stream: ReadableStream<Uint8Array>, limit: number) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new Error("文件超过 10 MB 限制");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function compressFile(file: File): Promise<Blob> {
  if (file.size > MAX_FILE_BYTES) throw new Error("原始文件不能超过 10 MB");
  if (typeof CompressionStream === "undefined") throw new Error("当前浏览器不支持文件压缩，请使用新版浏览器");
  const bytes = await readLimitedStream(file.stream().pipeThrough(new CompressionStream("gzip")), MAX_COMPRESSED_BYTES);
  return new Blob([bytes.buffer], { type: "application/gzip" });
}

export async function decompressFile(compressed: Blob, originalSize: number): Promise<Blob> {
  if (!Number.isSafeInteger(originalSize) || originalSize < 0 || originalSize > MAX_FILE_BYTES || compressed.size > MAX_COMPRESSED_BYTES) {
    throw new Error("文件大小不合法");
  }
  if (typeof DecompressionStream === "undefined") throw new Error("当前浏览器不支持文件解压，请使用新版浏览器");
  const bytes = await readLimitedStream(compressed.stream().pipeThrough(new DecompressionStream("gzip")), MAX_FILE_BYTES);
  if (bytes.byteLength !== originalSize) throw new Error("文件校验失败，请重新下载");
  return new Blob([bytes.buffer], { type: "application/octet-stream" });
}
