"use client";

// Simple accessible on/off switch that follows the light/dark tokens.
export default function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="min-h-[44px] min-w-[52px] flex items-center justify-center disabled:opacity-50"
    >
      <span
        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
          checked ? "bg-brand-sky" : "bg-brand-nightText/25"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </span>
    </button>
  );
}
