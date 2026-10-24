"use client";
import { useState } from "react";
import type { Emoji } from "@/lib/forum-features";
export function EmojiAdmin({ initial }: { initial: Emoji[] }) {
  const [items, setItems] = useState(initial),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/emojis", { method: "POST", body: form });
      if (!r.ok) throw new Error(await r.text());
      setItems(await (await fetch("/api/emojis")).json());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <form action={submit} className="space-y-3">
        <input
          name="name"
          placeholder="表情名称，如 debate_team"
          className="input"
          required
          pattern="[a-z][a-z0-9_]{0,31}"
        />
        <input
          name="file"
          type="file"
          accept="image/png,image/svg+xml"
          required
        />
        <button className="btn" disabled={busy}>
          上传表情
        </button>
      </form>
      <p role="alert">{error}</p>
      {items.map((e) => (
        <div key={e.name} className="flex items-center gap-3">
          {/* Stored images are already normalized to small PNGs. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={e.image_path} alt={e.name} width={32} height={32} />
          <code>:{e.name}:</code>
          <button
            className="btn"
            disabled={busy}
            onClick={() => {
              const f = new FormData();
              f.set("name", e.name);
              f.set("toggle", "1");
              void submit(f);
            }}
          >
            {e.active ? "停用" : "启用"}
          </button>
        </div>
      ))}
    </div>
  );
}
