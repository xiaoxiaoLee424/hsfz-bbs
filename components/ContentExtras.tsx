/* eslint-disable @next/next/no-img-element -- Local avatars and emoji assets retain native sizing. */
"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import Turndown from "turndown";
import { PostActionIcon } from "./PostActionIcon";
import { EmojiPopover } from "./EmojiPopover";
import { InternalCard } from "./PostQuote";
export { InternalCard };
type Snapshot = {
  counts: { key: string; count: number }[];
  mine: string[];
  liked: boolean;
  likes: number;
};
export function ContentExtras({
  thread,
  reply = 0,
  canQuote = false,
  canReply = true,
  author = "同学",
  directReplies = [],
  more,
}: {
  thread: number;
  reply?: number;
  canQuote?: boolean;
  canReply?: boolean;
  initial?: unknown;
  author?: string;
  directReplies?: {
    id: number;
    nickname: string;
    avatar: string;
    content: string;
  }[];
  more?: ReactNode;
}) {
  const [state, setState] = useState<Snapshot>({
      counts: [],
      mine: [],
      liked: false,
      likes: 0,
    }),
    [error, setError] = useState(""),
    // 进行中的动作只禁用对应按钮（"like" 或表情 key）：贴表情不该把点赞按钮也灰掉
    [pending, setPending] = useState<string[]>([]),
    locks = useRef(new Set<string>()),
    [expanded, setExpanded] = useState(false),
    [people, setPeople] = useState<Record<string, string>>({}),
    [custom, setCustom] = useState<
      { id: number; name: string; image_path: string }[]
    >([]);
  const query = `?thread=${thread}&reply=${reply}`;
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/reactions" + query, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("互动加载失败");
        return r.json();
      })
      .then(setState)
      .catch((e) => {
        if (e.name !== "AbortError") setError(String(e));
      });
    fetch("/api/emojis", { signal: controller.signal })
      .then((r) => r.json())
      .then(setCustom)
      .catch((e) => {
        if (e.name !== "AbortError") console.error(e);
      });
    return () => controller.abort();
  }, [query]);
  const mutate = useCallback(
    async (key: string, like = false) => {
      const id = like ? "like" : key;
      if (locks.current.has(id)) return;
      const previous = state,
        active = like ? !state.liked : !state.mine.includes(key);
      locks.current.add(id);
      setPending((list) => [...list, id]);
      setError("");
      setState((s) => {
        if (like)
          return { ...s, liked: active, likes: s.likes + (active ? 1 : -1) };
        const counts = s.counts
          .map((c) =>
            c.key === key ? { ...c, count: c.count + (active ? 1 : -1) } : c,
          )
          .filter((c) => c.count > 0);
        if (active && !counts.some((c) => c.key === key))
          counts.push({ key, count: 1 });
        return {
          ...s,
          counts,
          mine: active ? [...s.mine, key] : s.mine.filter((k) => k !== key),
        };
      });
      try {
        const r = await fetch("/api/reactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ thread, reply, key, active, like }),
        });
        if (!r.ok) throw new Error(await r.text());
        setState(await r.json());
      } catch (e) {
        setState(previous);
        setError(String(e));
      } finally {
        locks.current.delete(id);
        setPending((list) => list.filter((x) => x !== id));
      }
    },
    [state, thread, reply],
  );
  const select = useCallback(
    (entry: { key: string; code: string }) => {
      void mutate(entry.key);
    },
    [mutate],
  );
  const quote = useCallback(
    (copy = false) => {
      const body = document.querySelector(
          `[data-quote-body="${thread}-${reply}"]`,
        ),
        selection = window.getSelection();
      if (!body || !selection || selection.isCollapsed) return;
      const range = selection.getRangeAt(0);
      if (
        !body.contains(range.startContainer) ||
        !body.contains(range.endContainer)
      )
        return;
      const div = document.createElement("div");
      div.append(range.cloneContents());
      const td = new Turndown({ codeBlockStyle: "fenced" });
      // 引用回填保留 :short_code:，不降级成裸 Unicode / 图片
      td.addRule("customEmoji", {
        filter: (n) =>
          n.nodeName === "IMG" && n.classList.contains("custom-emoji"),
        replacement: (_, n) =>
          (n as HTMLElement).getAttribute("data-emoji-code") ||
          (n as HTMLElement).getAttribute("alt") ||
          "",
      });
      td.addRule("nativeEmoji", {
        filter: (n) =>
          n.nodeName === "SPAN" && n.classList.contains("native-emoji"),
        replacement: (_, n) =>
          (n as HTMLElement).getAttribute("data-emoji-code") ||
          (n as HTMLElement).textContent ||
          "",
      });
      const text = `\n\n[quote thread=${thread} reply=${reply}]\n\n${td.turndown(div.innerHTML)}\n\n[/quote]\n\n`;
      if (copy)
        navigator.clipboard
          .writeText(text)
          .then(() => setError("引用已复制"))
          .catch(() => setError("复制失败"));
      else
        window.dispatchEvent(new CustomEvent("forum-quote", { detail: text }));
    },
    [thread, reply],
  );
  useEffect(() => {
    if (!canQuote) return;
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d.key === `${thread}-${reply}`) quote(d.copy);
    };
    document.addEventListener("post-quote", handler);
    return () => document.removeEventListener("post-quote", handler);
  }, [thread, reply, quote, canQuote]);
  /** reaction key（unicode 字符 / custom:ID）→ 规范 :short_code: */
  async function reactionCode(key: string) {
    if (key.startsWith("custom:")) {
      const row = custom.find((e) => `custom:${e.id}` === key);
      return row ? `:${row.name}:` : key;
    }
    const { codeOf } = await import("@/lib/emoji-catalog");
    return codeOf(key) || key;
  }
  async function showUsers(key: string) {
    if (people[key]) return;
    try {
      const [code, r] = await Promise.all([
        reactionCode(key),
        fetch("/api/reactions" + query + "&users=1&key=" + encodeURIComponent(key)),
      ]);
      if (!r.ok) throw new Error("参与者加载失败");
      const data = await r.json();
      const nicks = data.items.map((u: { nickname: string }) => u.nickname);
      const total =
        state.counts.find((c) => c.key === key)?.count ?? nicks.length;
      setPeople((p) => ({
        ...p,
        [key]: `${nicks.slice(0, 2).join("、")}${
          total > 2 ? ` 等 ${total} 人` : ""
        }使用了 ${code}`,
      }));
    } catch {
      setPeople((p) => ({ ...p, [key]: "暂时无法加载" }));
    }
  }
  function emoji(key: string) {
    if (!key.startsWith("custom:")) return key;
    const row = custom.find((e) => e.id === Number(key.slice(7)));
    return row ? (
      <img src={row.image_path} alt={row.name} width={20} height={20} />
    ) : (
      "表情"
    );
  }
  return (
    <div className="post-interactions">
      {state.counts.length > 0 && (
        <div className="reaction-chips" aria-label="帖子 Reaction">
          {state.counts.map((c) => (
            <button
              type="button"
              key={c.key}
              className="reaction-chip"
              disabled={pending.includes(c.key)}
              aria-pressed={state.mine.includes(c.key)}
              aria-label={`${c.key}，${c.count}人，${state.mine.includes(c.key) ? "已参与" : "未参与"}`}
              onClick={() => void mutate(c.key)}
              onMouseEnter={() => void showUsers(c.key)}
              onFocus={() => void showUsers(c.key)}
              title={people[c.key] || "查看参与者"}
            >
              {emoji(c.key)}
              <span>{c.count}</span>
            </button>
          ))}
        </div>
      )}
      <div className="post-tools">
        <span>
          {directReplies.length > 0 && (
            <button
              type="button"
              className="post-text-action"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {directReplies.length} 个回复 {expanded ? "⌃" : "⌄"}
            </button>
          )}
        </span>
        <div className="post-actions">
          <EmojiPopover onSelect={select}>
            <PostActionIcon name="smile" />
          </EmojiPopover>
          <button
            type="button"
            className={`post-icon ${state.liked ? "is-liked" : ""}`}
            disabled={pending.includes("like")}
            aria-label="点赞"
            aria-pressed={state.liked}
            onClick={() => void mutate("", true)}
          >
            <PostActionIcon name="heart" filled={state.liked} />
            {state.likes > 0 && <span>{state.likes}</span>}
          </button>
          <button
            type="button"
            className="post-icon"
            aria-label="复制帖子链接"
            onClick={() =>
              navigator.clipboard
                .writeText(
                  `${location.origin}/t/${thread}${reply ? "#reply-" + reply : ""}`,
                )
                .then(() => setError("链接已复制"))
                .catch(() => setError("复制失败"))
            }
          >
            <PostActionIcon name="link" />
          </button>
          <details className="post-more">
            <summary aria-label="更多操作" className="post-icon">
              <PostActionIcon name="more" />
            </summary>
            <div className="post-more-menu">
              {canQuote && (
                <button
                  type="button"
                  onClick={() => {
                    const body = document.querySelector(
                      `[data-quote-body="${thread}-${reply}"]`,
                    );
                    if (!body) return;
                    const r = document.createRange();
                    r.selectNodeContents(body);
                    const s = window.getSelection();
                    s?.removeAllRanges();
                    s?.addRange(r);
                    quote();
                  }}
                >
                  引用全文
                </button>
              )}
              {more}
            </div>
          </details>
          <button
            type="button"
            className="post-text-action"
            disabled={!canReply}
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("forum-reply", {
                  detail: { replyTo: reply, nickname: author },
                }),
              )
            }
          >
            <PostActionIcon name="reply" />
            回复
          </button>
        </div>
      </div>
      {expanded && (
        <div className="reply-previews">
          {directReplies.map((r) => (
            <div key={r.id}>
              <div className="quote-source">
                {r.avatar ? (
                  <img src={r.avatar} alt="" width={24} height={24} />
                ) : (
                  <span className="source-avatar" aria-hidden>
                    {r.nickname.slice(0, 1)}
                  </span>
                )}
                <b>{r.nickname}</b>
              </div>
              <p>{r.content.slice(0, 160)}</p>
              <a href={`#reply-${r.id}`}>跳到帖子 ↓</a>
            </div>
          ))}
        </div>
      )}
      <span role="status" className="post-status">
        {error}
      </span>
    </div>
  );
}
