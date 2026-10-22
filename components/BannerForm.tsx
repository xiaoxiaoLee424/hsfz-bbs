"use client";

import { useRef, useState } from "react";
import { useActionState } from "react";
import { submitBannerAction } from "@/app/actions/banners";
import { BANNER_PRESETS, presetCss } from "@/lib/banner-presets";
import { SubmitButton } from "./SubmitButton";
import type { ActionState } from "@/app/actions/auth";

export function BannerForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(submitBannerAction, null);
  const [preset, setPreset] = useState<string>(BANNER_PRESETS[0].key);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const background = preview
    ? `linear-gradient(100deg, rgba(3,10,24,.74) 0%, rgba(3,10,24,.46) 55%, rgba(3,10,24,.32) 100%), url(${preview})`
    : presetCss(preset);

  return (
    <form action={formAction} className="space-y-4 p-4">
      {state && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            state.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
          }`}
        >
          {state.message}
        </div>
      )}

      {/* 实时预览 */}
      <div>
        <p className="mb-1.5 text-xs text-muted">效果预览（首页会自动横向滚动）</p>
        <div
          style={{ backgroundImage: background, backgroundSize: "cover", backgroundPosition: "center" }}
          className="flex h-[76px] max-w-[360px] flex-col justify-center rounded-md px-4 text-white ring-1 ring-white/15"
        >
          <p className="truncate text-sm font-semibold">{title || "你的标题会显示在这里"}</p>
          <p className="mt-0.5 truncate text-xs text-white/80">{text || "一句补充说明（可留空）"}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">标题</label>
          <input
            name="title"
            required
            minLength={2}
            maxLength={24}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
            placeholder="例：篮球社招新啦"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            副标题 <span className="text-xs font-normal text-muted">（可留空，最多 60 字）</span>
          </label>
          <input
            name="text"
            maxLength={60}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="input"
            placeholder="例：周五放学后，操场见"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          点击跳转 <span className="text-xs font-normal text-muted">（可留空）</span>
        </label>
        <input
          name="link"
          maxLength={300}
          className="input"
          placeholder="/t/123 或 https://example.com"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium">背景色卡</label>
        <div className="flex flex-wrap gap-2">
          {BANNER_PRESETS.map((item) => (
            <label key={item.key} className="cursor-pointer">
              <input
                type="radio"
                name="preset"
                value={item.key}
                checked={preset === item.key}
                onChange={() => setPreset(item.key)}
                className="peer sr-only"
              />
              <span
                style={{ backgroundImage: item.css }}
                className={`flex h-9 w-[74px] items-end justify-center rounded-md pb-1 text-[11px] font-medium text-white ring-2 transition ${
                  preset === item.key ? "ring-brand" : "ring-transparent hover:ring-line"
                }`}
              >
                {item.name}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          或者上传背景图 <span className="text-xs font-normal text-muted">（可选，JPG/PNG/WEBP/GIF，8MB 内）</span>
        </label>
        <input
          ref={fileRef}
          type="file"
          name="bg_image"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => {
            const file = e.target.files?.[0];
            setPreview(file ? URL.createObjectURL(file) : null);
          }}
          className="block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-l-md file:border-0 file:border-r file:border-line file:bg-soft file:px-3 file:py-2 file:text-sm file:font-medium"
        />
        {preview && (
          <button
            type="button"
            className="mt-2 text-xs text-red-600 hover:underline dark:text-red-400"
            onClick={() => {
              setPreview(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
          >
            移除背景图，改用色卡
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">投稿后会进入审核，管理员通过后才会出现在首页。</p>
        <SubmitButton pendingText="提交中…">📣 提交投稿</SubmitButton>
      </div>
    </form>
  );
}
