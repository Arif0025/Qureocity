"use client";

import { Phone } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function PhoneLinks({
  phone,
  secondaryPhone,
  className = "",
  showNumber = false,
}: {
  phone: string;
  secondaryPhone?: string | null;
  className?: string;
  showNumber?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const secondary = secondaryPhone?.trim() || null;

  useEffect(() => {
    if (!open) return;

    const closeWhenOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", closeWhenOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (!secondary) {
    return (
      <a
        href={`tel:${phone}`}
        onClick={(event) => event.stopPropagation()}
        className={className}
        aria-label={`Call ${phone}`}
      >
        {showNumber ? phone : <Phone size={12} />}
      </a>
    );
  }

  return (
    <span
      ref={containerRef}
      className="relative inline-flex"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={className}
        aria-label="Choose phone number"
        aria-expanded={open}
      >
        {showNumber ? `${phone} / ${secondary}` : <Phone size={12} />}
      </button>
      {open && (
        <span className="absolute z-20 left-0 top-full mt-1 min-w-[150px] rounded-lg border border-white/15 bg-brand-nightSurface p-1 shadow-xl">
          <a
            href={`tel:${phone}`}
            className="flex items-center gap-2 rounded-md px-2.5 py-2 text-xs text-brand-nightText hover:bg-white/10"
          >
            <Phone size={11} /> Primary: {phone}
          </a>
          <a
            href={`tel:${secondary}`}
            className="flex items-center gap-2 rounded-md px-2.5 py-2 text-xs text-brand-nightText hover:bg-white/10"
          >
            <Phone size={11} /> Secondary: {secondary}
          </a>
        </span>
      )}
    </span>
  );
}
