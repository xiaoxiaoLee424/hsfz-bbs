"use client";

import { useActionState } from "react";
import { importWhitelistAction } from "@/app/actions/admin";
import type { ActionState } from "@/app/actions/auth";
import { SubmitButton } from "./SubmitButton";

export function WhitelistImportForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(importWhitelistAction, null);
  return (
    <form action={formAction} className="space-y-3 p-4">
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
      <textarea
        name="roster"
        rows={5}
        required
        className="input resize-y font-mono text-xs"
        placeholder={"每行一条，逗号分隔，年级可省略：\n张远航, 20250101, 已毕业\n林小满, 20270215, 高二"}
      />
      <p className="text-xs text-muted">
        名单内的同学注册时填写匹配的姓名 + 学号即可<strong>免审核直接开通</strong>；每个学号只能使用一次。
      </p>
      <div className="flex justify-end">
        <SubmitButton icon="upload">导入名单</SubmitButton>
      </div>
    </form>
  );
}
