import { getSetting } from "@/lib/db";

export default async function SiteBadge({ className = "h-7 w-7" }: { className?: string }) {
  const badge = getSetting("site_badge");
  if (badge) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={badge}
        alt="站点徽章"
        className={`${className} shrink-0 rounded-full border border-white/30 object-cover`}
      />
    );
  }
  return <DefaultBadge className={className} />;
}

function DefaultBadge({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={`${className} shrink-0`} role="img" aria-label="HSFZ BBS">
      <circle cx="32" cy="32" r="30" fill="#176249" />
      <circle cx="32" cy="32" r="25.5" fill="none" stroke="#ffffff" strokeWidth="2.4" />
      <text
        x="32"
        y="42.5"
        textAnchor="middle"
        fontSize="27"
        fontWeight="700"
        fill="#ffffff"
        fontFamily="STKaiti, KaiTi, 'Noto Serif SC', serif"
      >
        附
      </text>
    </svg>
  );
}
