"use client";

import { useFormStatus } from "react-dom";
import { useEffect, useRef, useState } from "react";

/** 表单提交按钮：提交中自动禁用并显示等待文案 */
export function SubmitButton({
  children,
  className = "btn-primary",
  pendingText = "处理中…",
  disabled = false,
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}>
      {pending ? pendingText : children}
    </button>
  );
}

/**
 * 两步确认按钮：第一次点击进入待确认状态（变红），10 秒内再次点击才提交。
 * 不依赖 window.confirm，在微信内置浏览器等环境下同样可靠。
 */
export function ConfirmSubmit({
  children,
  className = "btn-xs",
  message,
  confirmText = "确认执行？",
}: {
  children: React.ReactNode;
  className?: string;
  message?: string;
  confirmText?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  return armed ? (
    <button type="submit" title={message} className={`${className} !border-red-400 !bg-red-500/10 !text-red-600 dark:!text-red-400`}>
      {confirmText}
    </button>
  ) : (
    <button
      type="button"
      title={message}
      className={className}
      onClick={(event) => {
        // React may reuse this node as the submit button before the click's default action.
        event.preventDefault();
        setArmed(true);
        timer.current = setTimeout(() => setArmed(false), 10000);
      }}
    >
      {children}
    </button>
  );
}
