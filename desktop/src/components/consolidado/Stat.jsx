export default function Stat({ title, subtitle = "Total", value, icon, isDark }) {
  return (
    <div className={`${isDark ? 'bg-[#1a1a1c] border-zinc-800' : 'bg-white border-zinc-200'} border rounded-xl p-4 md:p-5 shadow-sm flex items-start gap-4`}>
      <div className="text-3xl mt-1 opacity-90">
        {icon}
      </div>
      <div>
        <div className={`text-sm md:text-xs xl:text-sm font-bold leading-tight ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
          {title}
        </div>
        <div className={`text-[10px] mt-1 uppercase font-black tracking-wider ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
          {subtitle}: <span className={isDark ? 'text-zinc-300' : 'text-zinc-900'}>{value}</span>
        </div>
      </div>
    </div>
  );
}
