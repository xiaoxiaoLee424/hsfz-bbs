import { bannerVisual, type BannerRow } from "@/lib/banners";

function BannerCard({ banner }: { banner: BannerRow }) {
  const { style } = bannerVisual(banner.bg_kind, banner.bg_value);
  const inner = (
    <div
      style={style}
      className="flex h-[70px] w-[304px] flex-col justify-center rounded-md px-4 text-white shadow-sm ring-1 ring-white/15"
    >
      <p className="truncate text-sm font-semibold leading-5">{banner.title}</p>
      {banner.text && <p className="mt-0.5 truncate text-xs leading-5 text-white/80">{banner.text}</p>}
    </div>
  );
  return (
    <div className="pr-3">
      {banner.link ? (
        <a
          href={banner.link}
          target={banner.link.startsWith("/") ? undefined : "_blank"}
          rel="noreferrer"
          className="block transition-transform hover:-translate-y-0.5"
        >
          {inner}
        </a>
      ) : (
        inner
      )}
    </div>
  );
}

/** 首页顶部的投稿横幅：自动横向滚动，鼠标悬停暂停；没有内容时不渲染。 */
export function BannerStrip({ items }: { items: BannerRow[] }) {
  if (items.length === 0) return null;
  // 每条重复若干次，保证「半条轨道」足够宽，循环时不会出现空白。
  const repeat = Math.max(1, Math.ceil(4 / items.length));
  const half = Array.from({ length: repeat }, () => items).flat();
  const loop = [...half, ...half];
  const duration = Math.max(22, half.length * 6);

  return (
    <section className="banner-strip relative overflow-hidden rounded-lg border-[1.5px] border-line bg-soft/40">
      <div className="banner-track py-2 pl-2" style={{ animationDuration: `${duration}s` }}>
        {loop.map((banner, index) => (
          <BannerCard key={`${banner.id}-${index}`} banner={banner} />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-paper to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-paper to-transparent" />
    </section>
  );
}
