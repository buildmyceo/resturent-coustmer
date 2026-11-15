export default function TableLoading() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 space-y-4">
      <div className="w-9 h-9 border-3 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin" />
      <span className="text-xs font-semibold text-slate-400">Loading...</span>
    </div>
  );
}
