export function SocialLoading() {
  return <div role="status" aria-label="正在加载"><div className="page-heading"><h1>正在加载</h1></div><div className="card p-6 space-y-5" aria-hidden="true">{[1, 2, 3].map(row => <div key={row} className="flex gap-4"><div className="w-10 h-10 rounded-md bg-soft" /><div className="flex-1 space-y-3"><div className="w-2/5 h-4 bg-soft rounded" /><div className="w-3/5 h-3 bg-soft rounded" /></div></div>)}</div></div>;
}
