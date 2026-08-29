"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

export type PillSelectOption = {
  value: string;
  label: string;
  group?: string;
};

/**
 * A small themed dropdown to replace native <select> elements.
 * Native selects on dark surfaces render their popup with the OS/browser's
 * own light-background chrome regardless of our CSS (white text on white
 * background in most browsers), so anything sitting on a dark surface — the
 * whole admin panel — needs its own popup instead of relying on native
 * <option> styling.
 */
export default function PillSelect({
  value,
  onChange,
  options,
  placeholder = "All",
  className = "",
  triggerClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  options: PillSelectOption[];
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const selected = options.find((o) => o.value === value);

  const groups = options.reduce<Record<string, PillSelectOption[]>>(
    (acc, o) => {
      const key = o.group ?? "";
      (acc[key] ??= []).push(o);
      return acc;
    },
    {},
  );

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          triggerClassName ??
          "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full border border-white/15 bg-brand-nightSurface2 text-brand-nightText/70 hover:border-white/25 hover:text-brand-nightText transition-colors"
        }
      >
        <span className="flex-1 text-left truncate">
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={13}
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 min-w-[200px] w-full max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-brand-nightSurface shadow-lg py-1.5">
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left text-brand-nightText/80 hover:bg-white/5"
          >
            {placeholder}
            {value === "" && <Check size={14} className="text-brand-sky" />}
          </button>
          {Object.entries(groups).map(([group, opts]) => (
            <div key={group || "_"}>
              {group && (
                <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-brand-nightText/35">
                  {group}
                </p>
              )}
              {opts.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left text-brand-nightText/80 hover:bg-white/5"
                >
                  <span className="truncate">{o.label}</span>
                  {value === o.value && (
                    <Check size={14} className="text-brand-sky shrink-0" />
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
