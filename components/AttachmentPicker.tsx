"use client";

import { useEffect, useRef, useState } from "react";
import { DOCUMENT_LIMITS } from "@/lib/attachment-limits";

export function AttachmentPicker() {
  const inputRef = useRef<HTMLInputElement>(null);
  const chooserRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    // 工具栏的「添加附件」按钮经由该事件打开这里的文件选择框
    const open = () => chooserRef.current?.click();
    window.addEventListener("forum-open-attachments", open);
    return () => window.removeEventListener("forum-open-attachments", open);
  }, []);

  function sync(next: File[]) {
    const transfer = new DataTransfer();
    next.forEach((file) => transfer.items.add(file));
    if (inputRef.current) inputRef.current.files = transfer.files;
    setFiles(next);
  }

  function choose(list: FileList) {
    const next = [...files, ...Array.from(list)];
    let message = "";
    if (next.length > DOCUMENT_LIMITS.maxFiles) {
      message = `每次最多上传 ${DOCUMENT_LIMITS.maxFiles} 个附件，请减少文件后重试`;
    } else {
      for (const file of next) {
        const limit = DOCUMENT_LIMITS.maxFileBytes;
        if (!file.size || file.size > limit) {
          message = !file.size ? `“${file.name}”是空文件` : `“${file.name}”不能超过 ${limit / 1024 / 1024} MB`;
          break;
        }
      }
      if (!message && next.reduce((total, file) => total + file.size, 0) > DOCUMENT_LIMITS.maxTotalBytes) {
        message = `附件总大小不能超过 ${DOCUMENT_LIMITS.maxTotalBytes / 1024 / 1024} MB，请减少文件后重试`;
      }
    }
    setError(message);
    if (!message) sync(next);
    if (chooserRef.current) chooserRef.current.value = "";
  }

  return (
    <div>
      <input ref={inputRef} name="attachments" type="file" multiple className="hidden" tabIndex={-1} aria-hidden="true" />
      <input ref={chooserRef} type="file" multiple className="hidden" aria-label="选择文件" onChange={(event) => event.target.files && choose(event.target.files)} />
      {files.length > 0 && (
        <ul className="mb-2 space-y-2">
          {files.map((file, index) => (
            <li key={`${index}-${file.name}`} className="flex min-w-0 items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 break-all">{file.name}</span>
              <span className="shrink-0 text-xs text-muted">{file.size < 1024 * 1024 ? `${Math.ceil(file.size / 1024)} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`}</span>
              <button type="button" className="shrink-0 text-muted hover:text-red-600" aria-label={`删除 ${file.name}`} onClick={() => { sync(files.filter((_, position) => position !== index)); setError(""); }}>删除</button>
            </li>
          ))}
        </ul>
      )}
      {files.length < DOCUMENT_LIMITS.maxFiles && (
        <button type="button" className="hidden" onClick={() => chooserRef.current?.click()}>
          选择文件
        </button>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
