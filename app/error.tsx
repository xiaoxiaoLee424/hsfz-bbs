"use client";
import { IconButton } from "@/components/IconAction";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div className="form-page"><div className="page-heading"><h1>暂时无法加载</h1></div><div className="card p-6"><p className="mb-4 text-muted">加载时遇到了问题，请重试。未发送的消息请先保留。</p><IconButton className="btn-primary" icon="refresh" label="重新加载" onClick={reset} /></div></div>;
}
