export default function ProjectRouteLoading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="rounded-xl border border-border/50 bg-white/90 p-5 shadow-[0_1px_4px_rgba(15,23,42,0.06)]">
        <div className="h-3 w-24 rounded bg-slate-200/80" />
        <div className="mt-3 h-7 w-72 rounded bg-slate-200/80" />
        <div className="mt-2 h-3.5 w-full max-w-xl rounded bg-slate-100/80" />
        <div className="mt-5 flex gap-2">
          <div className="h-7 w-28 rounded-lg bg-slate-200/70" />
          <div className="h-7 w-36 rounded-lg bg-slate-200/70" />
          <div className="h-7 w-24 rounded-lg bg-slate-200/70" />
          <div className="h-7 w-32 rounded-lg bg-slate-200/70" />
        </div>
      </div>
      <div className="rounded-xl border border-border/50 bg-white/90 p-5 shadow-[0_1px_4px_rgba(15,23,42,0.06)]">
        <div className="h-3 w-40 rounded bg-slate-200/80" />
        <div className="mt-4 h-56 rounded-lg bg-slate-100/80" />
      </div>
    </div>
  );
}
