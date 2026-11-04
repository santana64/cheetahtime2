export default function ProductLoading() {
  return (
    <div className="space-y-4">
      <div className="h-32 animate-pulse rounded-xl bg-slate-200/60" />
      <div className="grid gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200/60" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-slate-200/60" />
    </div>
  );
}
