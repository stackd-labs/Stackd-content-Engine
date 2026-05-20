export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-navy-light to-navy shadow-gold">
        <span className="font-display text-lg font-black text-gold">S</span>
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-gold" />
      </div>
      {!collapsed && (
        <div className="leading-tight">
          <div className="text-sm font-bold tracking-tight text-white">
            STACKD <span className="text-gold">STUDIOS</span>
          </div>
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">
            Content Engine
          </div>
        </div>
      )}
    </div>
  );
}
