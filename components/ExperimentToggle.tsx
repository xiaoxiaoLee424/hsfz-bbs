"use client";
import { useFormStatus } from "react-dom";
import { ActionIcon } from "./ActionIcon";

export function ExperimentToggle({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  const label = enabled ? "关闭推荐" : "启用推荐";
  return <button className="experiment-switch" role="switch" aria-checked={enabled} aria-label="为你推荐" title={label} type="submit" disabled={pending} aria-busy={pending}>
    <span className="experiment-switch-track" aria-hidden="true">
      <span className="experiment-switch-thumb">{pending && <ActionIcon name="spinner" />}</span>
    </span>
  </button>;
}
