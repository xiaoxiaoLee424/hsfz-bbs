/** Compare the browser Origin against the actual HTTP Host, not Next's internal URL. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.host === request.headers.get("host")
    );
  } catch {
    return false;
  }
}
