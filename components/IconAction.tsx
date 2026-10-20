import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { ActionIcon, type ActionIconName } from "./ActionIcon";

type IconProps = { icon: ActionIconName; label: string; active?: boolean };
export function IconButton({ icon, label, active, className = "btn-xs", ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & IconProps) {
  return <button type="button" {...props} className={`${className} icon-button`} aria-label={label} title={label} aria-pressed={active}><ActionIcon name={props["aria-busy"] ? "spinner" : icon} active={active} /></button>;
}
export function IconLink({ icon, label, className = "btn", ...props }: Omit<ComponentProps<typeof Link>, "children"> & Omit<IconProps, "active">) {
  return <Link {...props} className={`${className} icon-button`} aria-label={label} title={label}><ActionIcon name={icon} /></Link>;
}
