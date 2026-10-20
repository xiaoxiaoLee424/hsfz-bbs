"use client";
import { ActionIcon } from "./ActionIcon";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { formatEditorSelection, insertEditorText, type EditorCommand, type EditorSelection } from "@/lib/editor";
import { EmojiPicker } from "./EditorEmojiPicker";
import { RichText } from "./RichText";
import { ScrollRow } from "./ScrollRow";

const tools: { command: EditorCommand; label: string; icon: ReactNode }[] = [
  { command: "bold", label: "加粗 (Ctrl/⌘ B)", icon: <path d="M7 4h6a4 4 0 0 1 0 8H7m0 0h7a4 4 0 0 1 0 8H7V4" /> },
  { command: "italic", label: "斜体 (Ctrl/⌘ I)", icon: <path d="M10 4h9M5 20h9M15 4 9 20" /> },
  { command: "heading", label: "二级标题", icon: <><path d="M4 5v14M14 5v14M4 12h10M18 14c0-4 6-3 4 0l-4 5h5" /></> },
  { command: "quote", label: "引用", icon: <path d="M4 6h6v7H4V6Zm10 0h6v7h-6V6ZM10 13c0 4-2 5-4 5m14-5c0 4-2 5-4 5" /> },
  { command: "list", label: "无序列表", icon: <><path d="M9 6h12M9 12h12M9 18h12" /><circle cx="4" cy="6" r=".7" /><circle cx="4" cy="12" r=".7" /><circle cx="4" cy="18" r=".7" /></> },
  { command: "ordered", label: "有序列表", icon: <path d="M10 6h11M10 12h11M10 18h11M3 4h1v5M2 14c0-3 5-3 4 0l-4 5h5" /> },
  { command: "link", label: "插入链接 (Ctrl/⌘ K)", icon: <path d="m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 2 1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(2 0)" /> },
  { command: "code", label: "代码（多行选区使用代码块）", icon: <path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16" /> },
  { command: "math", label: "行内公式 LaTeX", icon: <><path d="m5 9 7 10M12 9 5 19M15 4c0-3 6-3 5 0l-5 5h6" /></> },
  { command: "display-math", label: "独立公式 LaTeX", icon: <path d="M19 5H5l7 7-7 7h14M19 5v3m0 8v3" /> },
];
function Icon({ children }: { children: ReactNode }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}

/** Shared controlled source editor. Only the source textarea is submitted. */
export function MarkdownEditor({ id, value, onChange, name = "content", rows = 6, required = false, minLength, maxLength, disabled = false, placeholder = "写下想法，支持 Markdown、@用户名和 LaTeX…", onAttach, attachmentLabel = "上传文件", attachmentSelected = false }: {
  id: string; value: string; onChange: (value: string) => void; name?: string; rows?: number; required?: boolean; minLength?: number; maxLength?: number; disabled?: boolean; placeholder?: string;
  onAttach?: () => void; attachmentLabel?: string; attachmentSelected?: boolean;
}) {
  const unique = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const selection = useRef({ start: 0, end: 0 });
  const [preview, setPreview] = useState(false);
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<EditorSelection[]>([{ value, start: 0, end: 0 }]);
  const [position, setPosition] = useState(0);
  const helpId = `${unique}-help`;

  function restore(next: EditorSelection) {
    onChange(next.value);
    selection.current = { start: next.start, end: next.end };
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.start, next.end);
    });
  }
  function remember(next: EditorSelection, focus = true) {
    if (maxLength && next.value.length > maxLength) { setNotice(`最多可输入 ${maxLength.toLocaleString()} 个字符`); return; }
    setNotice("");
    const previous = history.slice(0, position + 1);
    previous[position] = { value, ...selection.current };
    const updated = [...previous, next].slice(-100);
    setHistory(updated); setPosition(updated.length - 1);
    if (focus) restore(next); else { selection.current = { start: next.start, end: next.end }; onChange(next.value); }
  }
  function source(): EditorSelection {
    const el = inputRef.current;
    return { value, start: el?.selectionStart ?? value.length, end: el?.selectionEnd ?? value.length };
  }
  function format(command: EditorCommand) { remember(formatEditorSelection(source(), command)); }
  function undo(redo = false) {
    const next = position + (redo ? 1 : -1);
    if (next < 0 || next >= history.length) return;
    setNotice(""); setPosition(next); restore(history[next]);
  }
  function shortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (disabled || event.nativeEvent.isComposing || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (["b", "i", "k"].includes(key) && !event.shiftKey) {
      event.preventDefault(); format(key === "b" ? "bold" : key === "i" ? "italic" : "link");
    } else if (key === "z" || key === "y") { event.preventDefault(); undo(key === "y" || event.shiftKey); }
  }
  function toolbarKeys(event: KeyboardEvent<HTMLElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }
  return <div className="markdown-editor" data-ui>
    <div className="editor-toolbar">
      <ScrollRow className="editor-tools" role="toolbar" aria-label="Markdown 和 LaTeX 工具，可横向滚动" onKeyDown={toolbarKeys}>
        {tools.map(tool => <button key={tool.command} type="button" className="editor-tool" title={tool.label} aria-label={tool.label} disabled={disabled || preview} onMouseDown={event => event.preventDefault()} onClick={() => format(tool.command)}><Icon>{tool.icon}</Icon></button>)}
        <EmojiPicker disabled={disabled || preview} onPick={emoji => remember(insertEditorText(source(), emoji))} />
        {onAttach && <button type="button" className={`editor-tool${attachmentSelected ? " has-attachment" : ""}`} title={attachmentLabel} aria-label={attachmentLabel} disabled={disabled} onClick={onAttach}><Icon><path d="m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2m-8 14a2 2 0 0 0 3 0l10-10" /></Icon>{attachmentSelected && <span className="editor-attachment-dot" />}</button>}
        <span className="editor-tool-gap" />
        <button type="button" className="editor-tool" title="撤销 (Ctrl/⌘ Z)" aria-label="撤销" disabled={disabled || preview || position === 0} onMouseDown={event => event.preventDefault()} onClick={() => undo()}><Icon><path d="M8 4 3 9l5 5M3 9h10a7 7 0 0 1 0 14" transform="translate(0 -2)" /></Icon></button>
        <button type="button" className="editor-tool" title="重做 (Ctrl/⌘ Shift Z)" aria-label="重做" disabled={disabled || preview || position === history.length - 1} onMouseDown={event => event.preventDefault()} onClick={() => undo(true)}><Icon><path d="m16 4 5 5-5 5m5-5H11a7 7 0 0 0 0 14" transform="translate(0 -2)" /></Icon></button>
      </ScrollRow>
      <div className="editor-tabs" role="tablist" aria-label="编辑模式">
        <button type="button" role="tab" className="icon-button" aria-label="编辑" title="编辑" id={`${unique}-write`} aria-selected={!preview} aria-controls={`${unique}-source`} tabIndex={preview ? -1 : 0} disabled={disabled} onKeyDown={event => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); setPreview(true); document.getElementById(`${unique}-preview`)?.focus(); } }} onClick={() => { setPreview(false); requestAnimationFrame(() => inputRef.current?.focus()); }}><ActionIcon name="edit" /></button>
        <button type="button" role="tab" className="icon-button" aria-label="预览排版" title="预览排版" id={`${unique}-preview`} aria-selected={preview} aria-controls={`${unique}-rendered`} tabIndex={preview ? 0 : -1} disabled={disabled} onKeyDown={event => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); setPreview(false); document.getElementById(`${unique}-write`)?.focus(); } }} onClick={() => setPreview(true)}><ActionIcon name="eye" /></button>
      </div>
    </div>
    <div role="tabpanel" id={`${unique}-source`} aria-labelledby={`${unique}-write`} hidden={preview}>
      <textarea ref={inputRef} id={id} name={name} value={value} rows={rows} required={required} minLength={minLength} maxLength={maxLength} readOnly={disabled} className="editor-source" placeholder={placeholder} aria-describedby={helpId}
        onChange={event => remember({ value: event.target.value, start: event.target.selectionStart, end: event.target.selectionEnd }, false)}
        onSelect={event => { selection.current = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd }; }} onKeyDown={shortcut}
        onInvalid={event => { if (preview) { event.preventDefault(); setPreview(false); requestAnimationFrame(() => inputRef.current?.reportValidity()); } }} />
    </div>
    <div role="tabpanel" id={`${unique}-rendered`} aria-labelledby={`${unique}-preview`} hidden={!preview} className="editor-rendered preview-body" style={{ minHeight: `${rows * 1.7 + 2}em` }}>
      {preview && (value.trim() ? <RichText content={value} /> : <p className="text-muted">写下内容后，在这里查看排版效果。</p>)}
    </div>
    <div className="editor-footer" id={helpId}><span>Markdown · $行内公式$ · $$独立公式$$</span>{maxLength && <span>{value.length.toLocaleString()} / {maxLength.toLocaleString()}</span>}</div>
    {notice && <p className="form-error editor-notice" role="status">{notice}</p>}
  </div>;
}
