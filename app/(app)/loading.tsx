// NFR-09: shown straight away on every screen while its data loads, so the app never looks frozen.
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 py-10 text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" aria-hidden />
      <span>Loading…</span>
    </div>
  );
}
