"use client";

import { useActionState, useState } from "react";
import {
  updateProfileAction,
  uploadAvatarAction,
  changePasswordAction,
} from "@/app/actions/profile";
import type { ActionState } from "@/app/actions/auth";
import { SubmitButton } from "./SubmitButton";

function Message({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <div
      className={`rounded-md border px-3 py-2 text-sm ${
        state.ok
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
      }`}
    >
      {state.message}
    </div>
  );
}

export function ProfileForm({
  nickname,
  bio,
  grade,
  phone,
}: {
  nickname: string;
  bio: string;
  grade: string;
  phone: string;}) {
  const [state, formAction] = useActionState(updateProfileAction, null);
  return (
    <form action={formAction} className="space-y-4 p-4">
      <Message state={state} />
      <div>
        <label className="mb-1 block text-sm font-medium">昵称</label>
        <input name="nickname" required maxLength={12} defaultValue={nickname} className="input" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">年级</label>
        <select name="grade" defaultValue={grade} className="input">
          <option value="">未填写</option>
          {["初一", "初二", "初三", "高一", "高二", "高三", "已毕业", "其他"].map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">绑定手机号（用于找回密码）</label>
        <input
          name="phone"
          maxLength={11}
          defaultValue={phone}
          className="input"
          placeholder="11 位手机号"
        />
        <p className="mt-1 text-xs text-muted">
          修改绑定需在下方输入当前登录密码确认；不修改则无需填写密码。
        </p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">
          当前登录密码<span className="ml-1 text-xs text-muted">（仅修改绑定手机号时需要填写）</span>
        </label>
        <input name="bind_password" type="password" className="input" placeholder="选填" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">个性签名</label>
        <textarea name="bio" maxLength={100} rows={3} defaultValue={bio} className="input resize-y" placeholder="介绍一下自己（100 字以内）" />
      </div>
      <div className="flex justify-end">
        <SubmitButton icon="save">保存资料</SubmitButton>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, null);
  return (
    <form action={formAction} className="space-y-4 p-4">
      <Message state={state} />
      <div>
        <label className="mb-1 block text-sm font-medium">当前密码</label>
        <input name="old_password" type="password" required className="input" placeholder="••••••••" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">新密码</label>
        <input name="new_password" type="password" required minLength={6} className="input" placeholder="至少 6 位" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">确认新密码</label>
        <input name="new_password2" type="password" required minLength={6} className="input" placeholder="再输入一次" />
      </div>
      <div className="flex justify-end">
        <SubmitButton icon="key">修改密码</SubmitButton>
      </div>
    </form>
  );
}

export function AvatarUploadForm() {
  const [state, formAction] = useActionState(uploadAvatarAction, null);
  const [sizeError, setSizeError] = useState("");
  return (
    <form
      action={formAction}
      className="space-y-3 p-4"
      onSubmit={(e) => {
        const file = (e.currentTarget.querySelector('input[name="avatar"]') as HTMLInputElement)
          .files?.[0];
        if (file && file.size > 2 * 1024 * 1024) {
          e.preventDefault();
          setSizeError(`「${file.name}」有 ${(file.size / 1024 / 1024).toFixed(1)}MB，超过 2MB 上限，请压缩或换一张小图`);
        } else {
          setSizeError("");
        }
      }}
    >
      <Message state={state} />
      {sizeError && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {sizeError}
        </div>
      )}
      <input
        type="file"
        name="avatar"
        accept="image/jpeg,image/png,image/webp,image/gif"
        required
        className="block w-full cursor-pointer rounded-md border border-line bg-input text-sm file:mr-3 file:cursor-pointer file:rounded-l-md file:border-0 file:border-r file:border-line file:bg-soft file:px-3 file:py-2 file:text-sm file:font-medium"
      />
      <p className="text-xs text-muted">支持 JPG / PNG / WEBP / GIF，不超过 2MB，展示时按方形裁剪。</p>
      <div className="flex justify-end">
        <SubmitButton icon="upload">上传头像</SubmitButton>
      </div>
    </form>
  );
}
