# Forum interface and shared editor

This change covers existing forum pages only. Conversation/group storage, file-transfer endpoints and recommendations are submitted separately. It is based on the current upstream main and preserves safe public user projections, password/session invalidation, password-confirmed phone binding, administrator-assisted resets, guest help, notifications, follow controls, blocking, moderation and rate limits.

The interface retains the Accent ladder app-screen direction (seed 1780879093), school-green accent and locally served DM Sans. Existing forum navigation folds into a bounded scrolling mobile menu. Sort controls, editor toolbars and compact action rows scroll horizontally rather than wrapping. Actions use consistent outline icons with accessible names, tooltips and visible keyboard focus; destructive actions retain explicit confirmation.

Threads and replies share a Markdown/LaTeX editor with selection-safe formatting, shortcuts, undo/redo, preview, emoji insertion and an image-upload tool. Rendering supports GFM, math and external link cards. Mentions are resolved only in prose; raw HTML and unsafe protocols are not enabled. Cards show URL-derived information without fetching external page metadata.

## Validation

Build, ESLint and four self-contained editor/rendering tests are run on this branch. Tests cover formatting/selection, block math/code, link insertion, GFM, KaTeX, link safety and mentions. Integrated browser checks additionally exercise the editor at 320/390/768/1440 pixels. Visual inspection uses the locally installed design skill; its tools and screenshots are deliberately excluded from Git.

The latest integrated Experimental, feed and posting screens have zero inspector failures at 390/768/1440 pixels. The only warnings are natural space below a single setting and existing secondary editor metadata. The setting keeps its content height rather than stretching a blank panel. Design score: 7.5; usability: 8.5; creativity: 6.5; content: 8.0. No new sample data is added by this UI change.
