const paths = {
  send: "m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13",
  compose: "M12 20H4V4h10m3-2 5 5-10 10-6 1 1-6L17 2Z",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  refresh: "M20 7V2l-4 4M4 17v5l4-4M20 7a9 9 0 0 0-16 2m0 8a9 9 0 0 0 16-2",
  upload: "M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5",
  download: "M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4",
  save: "M19 21H5l-2-2V5l2-2h12l4 4v12l-2 2ZM7 3v6h9V3M7 21v-8h10v8",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
  close: "m6 6 12 12M18 6 6 18",
  check: "m5 12 4 4L19 6",
  login: "M14 3h7v18h-7M3 12h13m-5-5 5 5-5 5",
  logout: "M10 3H3v18h7m3-14 5 5-5 5M8 12h13",
  'user-plus': "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM20 7v6m-3-3h6",
  'user-minus': "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm4 3h6",
  'group-plus': "M13 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M11 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm4-4a4 4 0 0 1 0 8m5 4v6m-3-3h6",
  message: "M21 11a9 9 0 0 1-9 9H3l1-6a9 9 0 1 1 17-3ZM8 10h8m-8 4h5",
  eye: "M2 12s3-8 10-8 10 8 10 8-3 8-10 8S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  edit: "m16 3 5 5-12 12-6 1 1-6L16 3Zm-2 2 5 5",
  heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
  star: "m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2 2 9.3l6.9-1L12 2Z",
  pin: "m16 3 5 5-4 1-4 5 1 3-2 2-7-7 2-2 3 1 5-4 1-4ZM3 21l5-5",
  'pin-off': "m16 3 5 5-4 1-2 3M5 12l7 7 2-2-1-3M3 21l5-5M3 3l18 18",
  award: "M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM7 4 5 8l2 4 5 2 5-2 2-4-2-4-5-2-5 2Zm1 10-1 8 5-3 5 3-1-8",
  ban: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM6 6l12 12",
  unlock: "M17 10V7a5 5 0 0 0-10 0M4 10h16v11H4V10Zm8 4v3",
  key: "M15 2a7 7 0 1 1-6 10l-7 7v3h4v-3h3v-3l3-3M16 6h.01",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  menu: "M4 6h16M4 12h16M4 18h16",
  plus: "M12 4v16M4 12h16",
  'toggle-off': "M16 6H8a6 6 0 0 0 0 12h8a6 6 0 0 0 0-12ZM11 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  'toggle-on': "M16 6H8a6 6 0 0 0 0 12h8a6 6 0 0 0 0-12ZM19 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  spinner: "M21 12a9 9 0 1 1-9-9",
} as const;
export type ActionIconName = keyof typeof paths;

/** A single stroke/size system for controls; labels belong on the interactive element. */
export function ActionIcon({ name, active = false }: { name: ActionIconName; active?: boolean }) {
  return <svg data-action-icon={name} className={name === "spinner" ? "action-icon action-spinner" : "action-icon"} width="18" height="18" viewBox="0 0 24 24" fill={active && (name === "heart" || name === "star") ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
