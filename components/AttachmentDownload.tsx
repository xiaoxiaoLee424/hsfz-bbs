"use client";
import { IconButton } from "./IconAction";

import { useEffect, useState } from "react";
import { decompressFile, formatFileSize, MAX_COMPRESSED_BYTES, readLimitedStream, type AttachmentInfo } from "@/lib/file-transfer";

export function AttachmentDownload({ attachment }: { attachment: AttachmentInfo }) {
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setExpired(true), Math.max(0, attachment.expires_at - Date.now()));
    return () => clearTimeout(timer);
  }, [attachment.expires_at]);

  async function download() {
    if (busy) return;
    if (Date.now() >= attachment.expires_at) { setExpired(true); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/attachments/${attachment.id}`, { cache: "no-store" });
      if (!response.ok) {
        if (response.status === 410) setExpired(true);
        const result = await response.json();
        throw new Error(result.message || "下载失败，请重试");
      }
      if (!response.body) throw new Error("文件内容不可用，请重试");
      const compressed = await readLimitedStream(response.body, MAX_COMPRESSED_BYTES);
      const original = await decompressFile(new Blob([compressed.buffer]), attachment.original_size);
      const url = URL.createObjectURL(original);
      const link = document.createElement("a");
      link.href = url; link.download = attachment.filename;
      document.body.appendChild(link); link.click(); link.remove();
      // Give the browser time to start saving, then release the in-memory copy.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "下载失败，请重试"); }
    finally { setBusy(false); }
  }

  return <div className="chat-attachment">
    <div className="attachment-copy"><b>{attachment.filename}</b><span>{formatFileSize(attachment.original_size)} · {expired ? "文件已过期" : "上传后保留 10 分钟"}</span></div>
    <IconButton icon="download" label={expired ? "文件已过期" : busy ? "下载并解压中…" : "下载文件"} disabled={expired || busy} aria-busy={busy} onClick={download} />
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
