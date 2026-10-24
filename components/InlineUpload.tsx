"use client";
import { useEffect, useRef, useState } from "react";
type Item = {
  id: string;
  file: File;
  progress: number;
  error: string;
  done: boolean;
  active: boolean;
};
export function InlineUpload({
  targetRef,
  onChange,
  onBusyChange,
}: {
  targetRef: React.RefObject<HTMLTextAreaElement | null>;
  onChange: (s: string) => void;
  onBusyChange: (b: boolean) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const requests = useRef(new Map<string, XMLHttpRequest>());
  const fileInput = useRef<HTMLInputElement>(null);
  const waiting = useRef(new Map<string, Item>());
  const retries = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const attempts = useRef(new Map<string, number>());
  const disposed = useRef(false);
  useEffect(() => {
    // 工具栏的「插入图片」按钮经由该事件打开这里的文件选择框
    const open = () => fileInput.current?.click();
    window.addEventListener("forum-open-images", open);
    return () => window.removeEventListener("forum-open-images", open);
  }, []);
  useEffect(() => {
    disposed.current = false;
    const queued = waiting.current,
      timers = retries.current,
      active = requests.current;
    return () => {
      disposed.current = true;
      queued.clear();
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      for (const x of active.values()) x.abort();
    };
  }, []);
  function update(id: string, change: Partial<Item>) {
    setItems((a) => a.map((i) => (i.id === id ? { ...i, ...change } : i)));
  }
  function pump() {
    if (disposed.current) return;
    for (const item of waiting.current.values()) {
      if (requests.current.size >= 2) break;
      waiting.current.delete(item.id);
      startUpload(item);
    }
    onBusyChange(
      requests.current.size + waiting.current.size + retries.current.size > 0,
    );
  }
  function upload(item: Item) {
    attempts.current.set(item.id, 0);
    update(item.id, { error: "排队中", progress: 0, active: true });
    waiting.current.set(item.id, item);
    pump();
  }
  function cancel(item: Item) {
    waiting.current.delete(item.id);
    const timer = retries.current.get(item.id);
    if (timer) clearTimeout(timer);
    retries.current.delete(item.id);
    requests.current.get(item.id)?.abort();
    update(item.id, { error: "已取消", active: false });
    pump();
  }
  function startUpload(item: Item) {
    const xhr = new XMLHttpRequest();
    attempts.current.set(item.id, (attempts.current.get(item.id) || 0) + 1);
    requests.current.set(item.id, xhr);
    onBusyChange(true);
    update(item.id, { error: "" });
    xhr.open("POST", "/api/inline-uploads");
    xhr.timeout = 30_000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        update(item.id, { progress: Math.round((e.loaded / e.total) * 100) });
    };
    const finish = () => {
      requests.current.delete(item.id);
      queueMicrotask(pump);
    };
    const fail = (message: string, retryable: boolean) => {
      finish();
      if (disposed.current) return;
      if (retryable && (attempts.current.get(item.id) || 0) < 3) {
        const delay = Math.max(
          Number(xhr.getResponseHeader("Retry-After") || 0) * 1000,
          1000 * 2 ** ((attempts.current.get(item.id) || 1) - 1),
        );
        update(item.id, { error: "即将自动重试" });
        retries.current.set(
          item.id,
          setTimeout(
            () => {
              retries.current.delete(item.id);
              waiting.current.set(item.id, item);
              pump();
            },
            Math.min(delay, 60000),
          ),
        );
      } else update(item.id, { error: message, active: false });
    };
    xhr.onload = () => {
      finish();
      if (xhr.status !== 200) {
        fail(
          xhr.responseText || "上传失败",
          [429, 502, 503, 504].includes(xhr.status),
        );
        return;
      }
      const { url, kind, name } = JSON.parse(xhr.responseText);
      const el = targetRef.current;
      if (el) {
        const token = `![上传中](upload-pending:${item.id})`;
        if (el.value.includes(token))
          onChange(
            el.value.replace(
              token,
              kind === "image"
                ? `![图片](${url})`
                : `[${String(name).replace(/[\[\]\\]/g, "_")}](${url})`,
            ),
          );
      }
      update(item.id, { done: true, active: false });
    };
    xhr.onerror = () => {
      fail("网络错误，请重试", true);
    };
    xhr.ontimeout = () => fail("上传超时，请重试", true);
    xhr.onabort = () => {
      finish();
      if (!disposed.current)
        update(item.id, { error: "已取消", active: false });
    };
    const data = new FormData();
    data.set("file", item.file);
    xhr.send(data);
  }
  const addRef = useRef<(files: File[]) => void>(() => {});
  useEffect(() => {
    addRef.current = (files) => {
      const el = targetRef.current;
      if (!el) return;
      const next = files.slice(0, 4).map((file) => ({
        id: crypto.randomUUID(),
        file,
        progress: 0,
        error: "",
        done: false,
        active: true,
      }));
      if (!next.length) return;
      const tokens = next
        .map((i) => `![上传中](upload-pending:${i.id})`)
        .join("\n");
      onChange(
        el.value.slice(0, el.selectionStart) +
          "\n\n" +
          tokens +
          "\n\n" +
          el.value.slice(el.selectionEnd),
      );
      setItems((a) => [...a, ...next]);
      next.forEach(upload);
    };
  });
  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    const paste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files || []).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length) {
        e.preventDefault();
        addRef.current(files);
      }
    };
    const drop = (e: DragEvent) => {
      const files = Array.from(e.dataTransfer?.files || []);
      el.classList.remove("composer-dragover");
      if (files.length) {
        e.preventDefault();
        addRef.current(files);
      }
    };
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) {
        e.preventDefault();
        el.classList.add("composer-dragover");
      }
    };
    const leave = () => el.classList.remove("composer-dragover");
    el.addEventListener("paste", paste);
    el.addEventListener("drop", drop);
    el.addEventListener("dragover", over);
    el.addEventListener("dragleave", leave);
    return () => {
      el.removeEventListener("paste", paste);
      el.removeEventListener("drop", drop);
      el.removeEventListener("dragover", over);
      el.removeEventListener("dragleave", leave);
      el.classList.remove("composer-dragover");
    };
  }, [targetRef]);
  // 零占位：常驻不渲染任何可见元素，仅在有上传任务时出现队列条（规格 §8）
  const pending = items.filter((i) => !i.done);
  return (
    <>
      <input
        ref={fileInput}
        className="hidden"
        type="file"
        multiple
        onChange={(e) => {
          addRef.current(Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />
      {pending.length > 0 && (
        <div className="composer-queue" role="status" aria-label="上传队列">
          {pending.map((i) => (
            <span key={i.id} className="composer-queue-item">
              <span className="min-w-0 truncate max-w-40">{i.file.name}</span>
              <span
                className="bar w-12"
                role="progressbar"
                aria-valuenow={i.progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${i.file.name} 上传进度`}
              >
                <span
                  style={{
                    display: "block",
                    height: "100%",
                    width: `${i.progress}%`,
                    background: "var(--tertiary)",
                  }}
                />
              </span>
              <span className={i.error ? "text-red-600 dark:text-red-400" : ""}>{i.error || `${i.progress}%`}</span>
              <button
                type="button"
                className="text-brand hover:underline"
                onClick={() =>
                  requests.current.has(i.id) ||
                  waiting.current.has(i.id) ||
                  retries.current.has(i.id)
                    ? cancel(i)
                    : upload(i)
                }
              >
                {i.active ? "取消" : "重试"}
              </button>
            </span>
          ))}
        </div>
      )}
    </>
  );
}
