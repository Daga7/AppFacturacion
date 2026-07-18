interface TabPillsProps<K extends string> {
  tabs: { key: K; label: string }[];
  active: K;
  onChange: (key: K) => void;
  size?: "md" | "sm";
}

// Selector de pestañas tipo "pills", el mismo patrón visual de toda la app.
export function TabPills<K extends string>({ tabs, active, onChange, size = "md" }: TabPillsProps<K>) {
  const pad = size === "md" ? "px-4 py-2" : "px-3 py-1.5";
  return (
    <div className="flex gap-1 bg-slate-900 rounded-lg p-1 w-fit">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`${pad} rounded-md text-sm font-medium transition-colors ${
            active === t.key ? "bg-brand/20 text-brand-light" : "text-slate-400 hover:text-white"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
