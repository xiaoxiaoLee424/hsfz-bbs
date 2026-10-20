"use client";

import { useFormStatus } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { ActionIcon, type ActionIconName } from "./ActionIcon";

/** Icon actions retain an accessible name and announce pending work. */
export function SubmitButton({ children, className = "btn-primary", pendingText = "处理中…", icon, label, active, count }: {
  children: React.ReactNode; className?: string; pendingText?: string; icon?: ActionIconName; label?: string; active?: boolean; count?: number;
}) {
  const { pending } = useFormStatus();
  const name = label ?? (typeof children === "string" ? children.trim() : undefined);
  return <button type="submit" disabled={pending} aria-label={pending ? `${name ?? ""}，${pendingText}` : name} title={name} aria-busy={pending} aria-pressed={active}
    className={`${className} ${icon ? "icon-button" : ""} disabled:cursor-not-allowed disabled:opacity-60`}>
    {icon ? <><ActionIcon name={pending ? "spinner" : icon} active={active} />{count !== undefined && <span aria-hidden="true">{count}</span>}<span className="sr-only" role="status">{pending ? pendingText : name}</span></> : pending ? pendingText : children}
  </button>;
}

/**
 * 两步确认按钮：第一次点击进入待确认状态（变红），再次点击原生提交表单。
 * 不依赖 window.confirm，在微信内置浏览器等环境下同样可靠。
 */
export function ConfirmSubmit({
  children,
  className = "btn-xs",
  message,
  confirmText = "确认执行？",
  icon,
}: {
  children: React.ReactNode;
  className?: string;
  message?: string;
  confirmText?: string;
  icon?: ActionIconName;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  return armed ? (
    <button type="submit" title={message} aria-label={`${confirmText} ${typeof children === "string" ? children : ""}`} className={`${className} !border-red-400 !bg-red-500/10 !text-red-600 dark:!text-red-400`}>
      {confirmText}
    </button>
  ) : (
    <button
      type="button"
      title={message ?? (typeof children === "string" ? children.trim() : undefined)}
      aria-label={typeof children === "string" ? children.trim() : message}
      className={`${className} ${icon ? "icon-button" : ""}`}
      onClick={event => {
        event.preventDefault();
        setArmed(true);
        timer.current = setTimeout(() => setArmed(false), 3000);
      }}
    >
      {icon ? <ActionIcon name={icon} /> : children}
    </button>
  );
}
