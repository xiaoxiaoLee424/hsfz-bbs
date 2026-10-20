"use client";
import { ActionIcon } from "./ActionIcon";

import { useRef, useState, useEffect, type RefObject } from "react";

/** 压缩到最长边 1600px 的 JPEG（GIF/PNG 保持原样以保留动图与透明度） */
async function compressImage(file: File): Promise<File> {
  if (file.type === "image/gif" || file.type === "image/png") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85)
  );
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

/** 图片选择器：多选、客户端压缩、缩略图预览与移除，随所在表单一起提交 */
export function ImagePicker({ max = 4, name = "images", externalInputRef, hideTrigger = false, disabled = false }: { max?: number; name?: string; externalInputRef?: RefObject<HTMLInputElement | null>; hideTrigger?: boolean; disabled?: boolean }) {
  const localRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef ?? localRef;
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => { previews.forEach(src => URL.revokeObjectURL(src)); }, [previews]);

  // React resets native fields after an action. Keep retried uploads aligned with the visible previews.
  useEffect(() => {
    const form = inputRef.current?.form;
    const serialize = (event: FormDataEvent) => {
      event.formData.delete(name);
      files.forEach(file => event.formData.append(name, file));
    };
    form?.addEventListener("formdata", serialize);
    return () => form?.removeEventListener("formdata", serialize);
  }, [files, inputRef, name]);

  useEffect(() => {
    const form = inputRef.current?.form;
    const waitForCompression = (event: Event) => { if (busy) event.preventDefault(); };
    form?.addEventListener("submit", waitForCompression, true);
    return () => form?.removeEventListener("submit", waitForCompression, true);
  }, [busy, inputRef]);

  function sync(next: File[]) {
    const dt = new DataTransfer();
    next.forEach((f) => dt.items.add(f));
    if (inputRef.current) inputRef.current.files = dt.files;
  }

  async function handleFiles(list: FileList) {
    setBusy(true);
    setError("");
    try {
      const picked = Array.from(list).slice(0, max);
      const compressed = await Promise.all(picked.map(compressImage));
      const merged = [...files, ...compressed].slice(0, max);
      setFiles(merged);
      setPreviews(merged.map((f) => URL.createObjectURL(f)));
      sync(merged);
    } catch {
      setError("图片处理失败，请重新选择 JPG、PNG、WEBP 或 GIF 图片。");
      sync(files);
    } finally {
      setBusy(false);
    }
  }

  function removeAt(i: number) {
    const merged = files.filter((_, idx) => idx !== i);
    setFiles(merged);
    setPreviews(merged.map(f => URL.createObjectURL(f)));
    sync(merged);
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        disabled={disabled || busy}
        name={name}
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
      {error && <p role="alert" className="form-error">{error}</p>}
      {busy && <p role="status" className="text-xs text-muted">正在处理图片…</p>}
      <div className="flex flex-wrap items-center gap-2">
        {previews.map((src, i) => (
          <div key={src} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`图片 ${i + 1}`}
              className="h-20 w-20 rounded-md border border-line object-cover"
            />
            <button
              type="button"
              onClick={() => removeAt(i)}
              disabled={disabled || busy}
              aria-label="移除图片" title="移除图片"
              className="icon-button image-remove-button absolute -right-1.5 -top-1.5 rounded-full bg-red-500 text-white"
            >
              <ActionIcon name="close" />
            </button>
          </div>
        ))}
        {!hideTrigger && files.length < max && (
          <button
            type="button"
            disabled={disabled || busy}
            aria-label={busy ? "正在处理图片" : "添加图片"} title="添加图片" onClick={() => inputRef.current?.click()}
            className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line text-xs text-muted hover:bg-soft disabled:opacity-50"
          >
            <ActionIcon name={busy ? "spinner" : "upload"} />
          </button>
        )}
      </div>
    </div>
  );
}
