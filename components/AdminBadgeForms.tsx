"use client";

import { useActionState, useState } from "react";
import { uploadBadgeAction } from "@/app/actions/admin";
import type { ActionState } from "@/app/actions/auth";
import { SubmitButton } from "./SubmitButton";

export function BadgeUploadForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(uploadBadgeAction, null);
  const [sizeError, setSizeError] = useState("");
  return (
    <form
      action={formAction}
      className="space-y-3 p-4"
      onSubmit={(e) => {
        const file = (e.currentTarget.querySelector('input[name="badge"]') as HTMLInputElement)
          .files?.[0];
        if (file && file.size > 2 * 1024 * 1024) {
          e.preventDefault();
          setSizeError(`「${file.name}」有 ${(file.size / 1024 / 1024).toFixed(1)}MB，超过 2MB 上限`);
        } else {
          setSizeError("");
        }
      }}
    >
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
      {sizeError && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {sizeError}
        </div>
      )}
      <input
        type="file"
        name="badge"
        accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
        required
        className="block w-full cursor-pointer rounded-md border border-line bg-input text-sm file:mr-3 file:cursor-pointer file:rounded-l-md file:border-0 file:border-r file:border-line file:bg-soft file:px-3 file:py-2 file:text-sm file:font-medium"
      />
      <p className="text-xs text-muted">
        支持 JPG / PNG / WEBP / GIF / SVG，≤2MB。建议上传学校官方校徽的方形图片，展示时会按圆形裁剪，全站顶栏与登录页即时生效。
      </p>
      <div className="flex justify-end">
        <SubmitButton icon="upload">上传徽章</SubmitButton>
      </div>
    </form>
  );
}
