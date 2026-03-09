export default function AppSectionLoader({ isDark }) {
  return (
    <div className="h-full w-full flex items-center justify-center">
      <div
        className={`rounded-xl border px-4 py-3 text-xs font-bold uppercase tracking-widest ${
          isDark
            ? "bg-[#121212] border-zinc-800 text-zinc-400"
            : "bg-white border-zinc-200 text-zinc-600"
        }`}
      >
        Cargando seccion...
      </div>
    </div>
  );
}
