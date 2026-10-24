/* eslint-disable @next/next/no-img-element -- Local avatars and emoji assets retain native sizing. */
"use client";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
export function PostQuote({
  thread,
  reply,
  children,
}: {
  thread: number;
  reply: number;
  children: ReactNode;
}) {
  const [source, setSource] = useState<{
      author: string;
      avatar: string;
    } | null>(null),
    [loaded, setLoaded] = useState(false),
    [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    fetch(`/api/content?thread=${thread}&reply=${reply}`, { signal: c.signal })
      .then(async (r) => {
        setSource(r.ok ? await r.json() : null);
        setLoaded(true);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setLoaded(true);
      });
    return () => c.abort();
  }, [thread, reply]);
  const long = String(flatten(children)).length > 600;
  return (
    <blockquote className="post-quote">
      <div className="quote-source">
        {source ? (
          <a href={`/t/${thread}${reply ? "#reply-" + reply : ""}`}>
            {source.avatar ? (
              <img src={source.avatar} alt="" width={18} height={18} />
            ) : (
              <span className="source-avatar" aria-hidden>
                {source.author.slice(0, 1)}
              </span>
            )}
            <span>{source.author}</span>
            <span className="quote-jump">↗</span>
          </a>
        ) : (
          <span>{loaded ? "来源不可访问" : "加载来源…"}</span>
        )}
      </div>
      <div className={long && !expanded ? "quote-collapsed" : ""}>
        {children}
      </div>
      {long && (
        <button
          type="button"
          className="post-text-action"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "收起" : "展开引用"}
        </button>
      )}
    </blockquote>
  );
}
function flatten(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (Array.isArray(value)) return value.map(flatten).join("");
  if (value && typeof value === "object" && "props" in value)
    return flatten((value.props as { children?: ReactNode }).children);
  return "";
}
export function InternalCard({
  thread,
  reply = 0,
}: {
  thread: number;
  reply?: number;
}) {
  const [data, setData] = useState<{
      title: string;
      author: string;
      excerpt: string;
    } | null>(null),
    [done, setDone] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    fetch(`/api/content?thread=${thread}&reply=${reply}`, { signal: c.signal })
      .then(async (r) => {
        setData(r.ok ? await r.json() : null);
        setDone(true);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setDone(true);
      });
    return () => c.abort();
  }, [thread, reply]);
  return (
    <span className="internal-post-card">
      {data ? (
        <>
          <a href={`/t/${thread}${reply ? "#reply-" + reply : ""}`}>
            <b>{data.title}</b>
          </a>
          <span>{data.author}</span>
          <span>{data.excerpt}</span>
        </>
      ) : done ? (
        "内容不可访问"
      ) : (
        "加载预览…"
      )}
    </span>
  );
}
