"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";

export type AnimatedSelectOption = {
  value: string;
  label: string;
  hint?: string;
  badge?: string;
};

export default function AnimatedSelect({
  value,
  onChange,
  options,
  label,
  placeholder = "Choose an option",
}: {
  value: string;
  onChange: (value: string) => void;
  options: AnimatedSelectOption[];
  label: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (open) requestAnimationFrame(() => optionRefs.current[activeIndex]?.focus());
  }, [open, activeIndex]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !triggerRef.current?.parentElement?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const pick = (option: AnimatedSelectOption) => {
    onChange(option.value);
    close();
  };
  const openAt = (index: number) => {
    setActiveIndex(Math.max(0, Math.min(index, options.length - 1)));
    setOpen(true);
  };

  return <div className="relative min-w-0">
    <span className="mb-1 block text-xs font-medium text-brand-nightText/55">{label}</span>
    <button
      ref={triggerRef}
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={`${id}-options`}
      onClick={() => open ? close(false) : openAt(selectedIndex)}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          openAt(selectedIndex + (event.key === "ArrowDown" ? 1 : -1));
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (open) pick(options[activeIndex]); else openAt(selectedIndex);
        } else if (event.key === "Escape" && open) close(false);
      }}
      className={`flex min-h-11 w-full items-center gap-3 rounded-xl border bg-brand-nightSurface2 px-3 text-left text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-sky/60 ${open ? "border-brand-sky/55 shadow-[0_0_0_1px_rgba(116,166,230,0.12)]" : "border-white/10 hover:border-brand-sky/30"}`}
    >
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-medium ${selected ? "text-brand-nightText" : "text-brand-nightText/45"}`}>{selected?.label ?? placeholder}</span>
        {selected?.hint && <span className="mt-0.5 block truncate text-[11px] text-brand-nightText/40">{selected.hint}</span>}
      </span>
      {selected?.badge && <span className="shrink-0 rounded-full bg-brand-leaf/12 px-2 py-0.5 text-[10px] font-semibold text-brand-leaf">{selected.badge}</span>}
      <ChevronDown size={16} className={`shrink-0 text-brand-skyLight transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
    </button>
    <AnimatePresence initial={false}>
      {open && <motion.div
        id={`${id}-options`}
        role="listbox"
        aria-label={label}
        initial={{ height: 0, opacity: 0, y: -4 }}
        animate={{ height: "auto", opacity: 1, y: 0 }}
        exit={{ height: 0, opacity: 0, y: -4 }}
        transition={{ duration: 0.17, ease: "easeOut" }}
        className="mt-1.5 overflow-hidden rounded-xl border border-brand-sky/25 bg-brand-nightSurface shadow-xl shadow-black/20"
      >
        <div className="max-h-56 overflow-y-auto p-1.5">
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return <motion.button
              ref={(node) => { optionRefs.current[index] = node; }}
              key={option.value || "__empty__"}
              type="button"
              role="option"
              aria-selected={isSelected}
              tabIndex={isActive ? 0 : -1}
              onFocus={() => setActiveIndex(index)}
              onClick={() => pick(option)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const next = Math.max(0, Math.min(index + (event.key === "ArrowDown" ? 1 : -1), options.length - 1));
                  setActiveIndex(next);
                  optionRefs.current[next]?.focus();
                } else if (event.key === "Home" || event.key === "End") {
                  event.preventDefault();
                  const next = event.key === "Home" ? 0 : options.length - 1;
                  setActiveIndex(next);
                  optionRefs.current[next]?.focus();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  close();
                }
              }}
              whileTap={{ scale: 0.99 }}
              className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-100 ${isSelected ? "bg-brand-sky/12 text-brand-skyLight" : isActive ? "bg-white/[0.06] text-brand-nightText" : "text-brand-nightText/70 hover:bg-white/[0.04]"}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{option.label}</span>
                {option.hint && <span className="mt-0.5 block truncate text-[11px] text-brand-nightText/40">{option.hint}</span>}
              </span>
              {option.badge && <span className="shrink-0 rounded-full bg-brand-leaf/12 px-2 py-0.5 text-[10px] font-semibold text-brand-leaf">{option.badge}</span>}
              {isSelected && <Check size={15} className="shrink-0 text-brand-skyLight" />}
            </motion.button>;
          })}
        </div>
      </motion.div>}
    </AnimatePresence>
  </div>;
}
