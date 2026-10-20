"use client";

import { useActionState } from "react";
import { createTicketAction } from "@/app/actions/profile";
import type { ActionState } from "@/app/actions/auth";
import { SubmitButton } from "./SubmitButton";

export function NewTicketForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(createTicketAction, null);
  return (
    <form action={formAction} className="space-y-3 p-4">
      {state && !state.ok && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {state.message}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">分类</label>
          <select name="category" required defaultValue="suggestion" className="input">
            <option value="title_request">头衔申请</option>
            <option value="suggestion">改进建议</option>
            <option value="report">举报</option>
            <option value="other">其他</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">主题</label>
          <input name="subject" required minLength={2} maxLength={60} className="input" placeholder="一句话说明来意" />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">详细内容</label>
        <textarea
          name="content"
          required
          minLength={5}
          rows={5}
          className="input resize-y"
          placeholder="申请头衔请说明理由；举报请附帖子链接或描述；建议越具体越好。"
        />
      </div>
      <div className="flex justify-end">
        <SubmitButton icon="send" pendingText="提交中…">提交工单</SubmitButton>
      </div>
    </form>
  );
}
