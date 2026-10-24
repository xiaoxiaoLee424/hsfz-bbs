"use client";
import { useCallback, useState, type TextareaHTMLAttributes } from "react";
import { ComposerToolbar, ImageToolButton, AttachmentToolButton, composerShortcutHandler } from "./ComposerToolbar";
import { EmojiPicker } from "./EmojiPicker";
import { InlineUpload } from "./InlineUpload";
import { AttachmentPicker } from "./AttachmentPicker";
import { MarkdownPreview } from "./MarkdownPreview";
import { useIsWide } from "./useIsWide";

/** 预览显隐状态：桌面控制右侧栏开关，移动端在「编辑/预览」间切换。 */
export function useComposerPreview() {
  const isWide = useIsWide();
  const [showPreview, setShowPreview] = useState(true);
  const [mobilePreview, setMobilePreview] = useState(false);
  const toggle = useCallback(() => {
    // 点击瞬间读取实时断点，避免 resize 后用到过期状态
    if (matchMedia("(min-width: 1024px)").matches) setShowPreview((value) => !value);
    else setMobilePreview((value) => !value);
  }, []);
  const pressed = isWide ? showPreview : mobilePreview;
  return {
    isWide,
    pressed,
    toggle,
    label: isWide
      ? showPreview
        ? "隐藏预览"
        : "显示预览"
      : mobilePreview
        ? "✏️ 编辑"
        : "👁 预览",
    showPreview,
    mobilePreview,
  };
}

export type ComposerPreview = ReturnType<typeof useComposerPreview>;

/** 发帖与回复共用的编辑器主体：工具栏 + Markdown 编辑栏 + 实时预览栏 + 按需出现的上传队列。
 * 表单只保留各自的元数据、头部与页脚。 */
export function ComposerBody({
  targetRef,
  onChange,
  content,
  onInlineBusyChange,
  resetKey = 0,
  preview,
  textarea,
}: {
  targetRef: React.RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
  content: string;
  onInlineBusyChange?: (busy: boolean) => void;
  /** 提交成功后递增以重置上传队列与附件选择 */
  resetKey?: number;
  preview: ComposerPreview;
  textarea: TextareaHTMLAttributes<HTMLTextAreaElement>;
}) {
  return (
    <div className="composer-body" data-preview={preview.showPreview} data-mobile={preview.mobilePreview}>
      <div className="composer-pane composer-editor">
        <ComposerToolbar targetRef={targetRef} onChange={onChange}>
          <ImageToolButton />
          <AttachmentToolButton />
          <EmojiPicker targetRef={targetRef} onChange={onChange} />
        </ComposerToolbar>
        <textarea
          {...textarea}
          ref={targetRef}
          value={content}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={composerShortcutHandler(onChange)}
          className="composer-editor-text"
          spellCheck={false}
        />
        <InlineUpload
          key={"inline" + resetKey}
          targetRef={targetRef}
          onChange={onChange}
          onBusyChange={onInlineBusyChange ?? (() => {})}
        />
        <div className="min-w-0 px-2 pb-1">
          <AttachmentPicker key={resetKey} />
        </div>
      </div>
      <div className="composer-pane composer-preview" aria-label="实时预览">
        <div className="composer-pane-head">实时预览</div>
        <div className="composer-scroll">
          {content.trim() ? (
            <MarkdownPreview content={content} className="text-sm" />
          ) : (
            <p className="composer-preview-empty">预览将显示在这里</p>
          )}
        </div>
      </div>
    </div>
  );
}
