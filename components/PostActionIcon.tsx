export function PostActionIcon({
  name,
  filled = false,
}: {
  name: "smile" | "heart" | "link" | "more" | "reply";
  filled?: boolean;
}) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "heart" ? (
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
      ) : name === "smile" ? (
        <>
          <path d="M20 12a8 8 0 1 1-8-8M17 3v6m-3-3h6M8 14s1.5 2 4 2 4-2 4-2" />
          <path d="M8.5 9h.01M12.5 9h.01" />
        </>
      ) : name === "link" ? (
        <>
          <path d="m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M14 8l2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" />
        </>
      ) : name === "reply" ? (
        <path d="m9 5-7 7 7 7M2 12h11a8 8 0 0 1 8 8" />
      ) : (
        <>
          <circle cx="5" cy="12" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
        </>
      )}
    </svg>
  );
}
