# Temporary DM and group files

DMs and group discussions now accept one file per message, either on its own or with text.

- **Original file limit:** 10 × 1024 × 1024 bytes, inclusive. The limit is checked in both the browser and the server, against the actual decompressed bytes.
- **Before upload:** the browser uses `CompressionStream("gzip")`. Files are not sent uncompressed. Small gzip overhead is allowed for already-compressed/incompressible files; the original-size limit still applies.
- **Storage:** only the gzip bytes are persisted, as a SQLite BLOB in `chat_attachments`, alongside the filename, original/compressed sizes and an epoch expiry timestamp. The server briefly decompresses in bounded memory to validate size and gzip integrity. Uploads are attached to their message atomically, so failed sends leave no orphan BLOBs.
- **Before saving a download:** the browser fetches the compressed bytes, uses `DecompressionStream("gzip")`, verifies the original length, and saves the original file with its filename. Download responses have no `Content-Encoding` header; this keeps transport decoding separate from the explicit frontend decompression. Responses use `private, no-store` and attachment disposition.
- **Ten-minute retention:** measured from successful message/upload persistence. The download endpoint rejects expired files immediately with HTTP 410. The running host removes expired BLOB rows every second; startup and upload/download cleanup cover restarts or suspended runtimes. Message text and the expired-file marker remain, but the file row—including its filename and BLOB—is deleted.
- **Database space:** SQLite secure deletion is enabled, and expiry cleanup checkpoints/truncates the WAL after deleting BLOBs. Freed database pages are reusable; the main `.db` file can retain its peak allocation rather than shrinking after each expiry. Existing external backups, if any, have their own retention policy.
- **Access:** only DM participants and current group members can download. Banned/unapproved accounts are rejected. Unknown or unauthorized attachment IDs return HTTP 404; unauthenticated requests return 401. Leaving a group immediately revokes file access.
- **Browser support:** file transfer requires the native Compression Streams API. Unsupported browsers show an error and retain the draft instead of uploading raw bytes. Ordinary text messaging still works.

No new npm dependencies were added. The existing 12 MB Server Action body limit accommodates a 10 MB original file, gzip overhead, metadata and accompanying text.

## Validation

The branch has 19 self-contained tests covering conversation identity, participant/member access, pagination and read markers; original-size and compressed-size boundaries; gzip integrity; rollback; ten-minute expiry including idle cleanup; legacy database migration and repeat startup; bidirectional blocking; moderation and DM cooldowns. Tests use disposable databases and leave runtime data untouched.

The complete integrated application also passes 14 browser scenarios, including actual gzip upload, download/decompression with exact filename and bytes, draft preservation, joining/leaving groups and editor scrolling at four widths. Optional browser automation, visual tooling and screenshots remain local rather than being dependencies of this PR. The standalone branch is built and smoke-tested separately against the current upstream main.

The schema migration replaces the legacy recipient/is_read DM table transactionally with one conversation per sorted user pair, message IDs/timestamps retained and monotonic read markers. Legacy DM URLs redirect to the inbox. Back up a production database before deployment; rollback after new messages requires a data-aware migration rather than only reverting application code.

The web feature uses the existing Markdown utility library and shares the editor/control components with the separate interface PR. It does not replace the forum layout or change recommendation behavior. Deployment requires the existing 12 MB Server Action limit and browser Compression Streams support for file sends; text remains usable if compression is unavailable.
