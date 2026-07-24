import { useState, useMemo, useRef, useEffect } from "react";
import type { Product } from "../../lib/types";
import { formatMoney } from "../../lib/format";
import { inputCls } from "./inputs";

// Selector de producto con búsqueda por nombre o código de barras. Devuelve el
// id del producto elegido. Reutilizado por traslados, solicitudes de precio y
// lista de compras.
interface ProductSelectProps {
  products: Product[];
  value: string;
  onChange: (productId: string) => void;
  placeholder?: string;
}

export function ProductSelect({
  products,
  value,
  onChange,
  placeholder = "Buscar producto por nombre o código...",
}: ProductSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const selected = products.find((p) => p.id === value) ?? null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [products, query]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2">
        <div className="min-w-0">
          <p className="text-white text-sm truncate">{selected.name}</p>
          <p className="text-xs text-slate-500">
            {selected.barcode} · {formatMoney(selected.salePrice)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange("");
            setQuery("");
            setOpen(true);
          }}
          className="text-slate-400 hover:text-white text-sm shrink-0"
        >
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={boxRef}>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={`${inputCls} w-full`}
      />
      {open && matches.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-slate-800 border border-slate-700 rounded-lg shadow-lg">
          {matches.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => {
                onChange(p.id);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-slate-700 transition-colors"
            >
              <p className="text-white text-sm truncate">{p.name}</p>
              <p className="text-xs text-slate-500">
                {p.barcode} · {formatMoney(p.salePrice)}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
