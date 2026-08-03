"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronDown, X } from "lucide-react";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MAX_CHILD_AGE_YEARS = 17;

type Step = "day" | "month" | "year";

type ParsedDate = {
  day: number | null;
  month: number | null;
  year: number | null;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function parseDate(value: string): ParsedDate {
  const parts = value.split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return { day: null, month: null, year: null };
  }
  const [year, month, day] = parts;
  return { day, month, year };
}

function isValidDate(year: number, month: number, day: number): boolean {
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function toISODate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function prettyDate(value: string): string {
  const parsed = parseDate(value);
  if (!parsed.year || !parsed.month || !parsed.day) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(parsed.year, parsed.month - 1, parsed.day));
}

function currentDefault(yearsBack: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - yearsBack);
  return date.toISOString().slice(0, 10);
}

export default function BirthDateDial({
  value,
  onChange,
  label = "Birth date",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("day");
  const [draft, setDraft] = useState<ParsedDate>(() =>
    parseDate(value || currentDefault(5)),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDraft(parseDate(value || currentDefault(5)));
      setStep("day");
      setError(null);
    }
  }, [open, value]);

  const selectedLabel = useMemo(() => {
    if (!draft.year || !draft.month || !draft.day) return "Select birth date";
    return prettyDate(toISODate(draft.year, draft.month, draft.day));
  }, [draft]);

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from(
      { length: MAX_CHILD_AGE_YEARS + 1 },
      (_, i) => currentYear - i,
    );
  }, []);

  const commit = () => {
    if (!draft.year || !draft.month || !draft.day) {
      setError("Select a day, month, and year.");
      return;
    }
    if (!isValidDate(draft.year, draft.month, draft.day)) {
      setError("That date does not exist. Please go back and adjust it.");
      return;
    }
    onChange(toISODate(draft.year, draft.month, draft.day));
    setOpen(false);
  };

  const previewParts = [
    { key: "day", label: draft.day ? pad2(draft.day) : "Day" },
    { key: "month", label: draft.month ? MONTHS[draft.month - 1] : "Month" },
    { key: "year", label: draft.year ? String(draft.year) : "Year" },
  ] as const;

  return (
    <div className="relative">
      <label className="block text-sm text-brand-ink/60 mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full min-h-[48px] rounded-xl border border-brand-ink/10 bg-white px-3 text-left flex items-center justify-between gap-3"
      >
        <span className={value ? "text-brand-ink" : "text-brand-ink/40"}>
          {value ? selectedLabel : "Tap to choose a birth date"}
        </span>
        <ChevronDown size={16} className="text-brand-ink/40 shrink-0" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 py-4">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-brand-ink/10">
              <div>
                <p className="text-sm font-semibold text-brand-ink">
                  Choose birth date
                </p>
                <p className="text-xs text-brand-ink/50">
                  Day, then month, then year
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-9 h-9 rounded-full bg-brand-cloud text-brand-ink/60 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 pt-4">
              <div className="rounded-2xl bg-brand-cloud/60 p-3 border border-brand-ink/10">
                <div className="flex items-center justify-between gap-2">
                  {previewParts.map((part, index) => {
                    const isActive =
                      (step === "day" && part.key === "day") ||
                      (step === "month" && part.key === "month") ||
                      (step === "year" && part.key === "year");
                    return (
                      <button
                        key={part.key}
                        type="button"
                        onClick={() => {
                          setStep(part.key);
                          setError(null);
                        }}
                        className={`flex-1 rounded-xl px-2 py-2 text-center transition-colors ${
                          isActive
                            ? "bg-brand-sky text-white"
                            : "bg-white text-brand-ink border border-brand-ink/10"
                        }`}
                      >
                        <span className="block text-[10px] uppercase tracking-wide opacity-70">
                          {index === 0 ? "Day" : index === 1 ? "Month" : "Year"}
                        </span>
                        <span className="block text-sm font-semibold">
                          {part.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-brand-ink/55">
                  {selectedLabel}
                </p>
              </div>
            </div>

            <div className="px-5 py-4">
              {step !== "day" && (
                <button
                  type="button"
                  onClick={() => {
                    setStep(step === "year" ? "month" : "day");
                    setError(null);
                  }}
                  className="mb-3 inline-flex items-center gap-1 rounded-full border border-brand-ink/10 px-3 py-1.5 text-xs font-semibold text-brand-ink/60"
                >
                  <ChevronLeft size={14} /> Back
                </button>
              )}

              {step === "day" && (
                <div>
                  <p className="text-sm font-semibold text-brand-ink mb-3">
                    Pick the day
                  </p>
                  <div className="grid grid-cols-7 gap-2">
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          setDraft((prev) => ({ ...prev, day }));
                          setStep("month");
                          setError(null);
                        }}
                        className={`h-11 rounded-xl border text-sm font-semibold transition-colors ${
                          draft.day === day
                            ? "border-brand-sky bg-brand-sky text-white"
                            : "border-brand-ink/10 bg-white text-brand-ink hover:border-brand-sky/30"
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === "month" && (
                <div>
                  <p className="text-sm font-semibold text-brand-ink mb-3">
                    Pick the month
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {MONTHS.map((month, index) => {
                      const monthNumber = index + 1;
                      return (
                        <button
                          key={month}
                          type="button"
                          onClick={() => {
                            setDraft((prev) => ({
                              ...prev,
                              month: monthNumber,
                            }));
                            setStep("year");
                            setError(null);
                          }}
                          className={`h-11 rounded-xl border text-sm font-semibold transition-colors ${
                            draft.month === monthNumber
                              ? "border-brand-sky bg-brand-sky text-white"
                              : "border-brand-ink/10 bg-white text-brand-ink hover:border-brand-sky/30"
                          }`}
                        >
                          {month}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === "year" && (
                <div>
                  <p className="text-sm font-semibold text-brand-ink mb-3">
                    Pick the year
                  </p>
                  <div className="max-h-72 overflow-y-auto pr-1">
                    <div className="grid grid-cols-3 gap-2">
                      {years.map((year) => (
                        <button
                          key={year}
                          type="button"
                          onClick={() => {
                            setDraft((prev) => ({ ...prev, year }));
                            setError(null);
                          }}
                          className={`h-11 rounded-xl border text-sm font-semibold transition-colors ${
                            draft.year === year
                              ? "border-brand-sky bg-brand-sky text-white"
                              : "border-brand-ink/10 bg-white text-brand-ink hover:border-brand-sky/30"
                          }`}
                        >
                          {year}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <p className="mt-3 rounded-xl bg-brand-coral/10 px-3 py-2 text-xs font-medium text-brand-coral">
                  {error}
                </p>
              )}
            </div>

            <div className="flex gap-2 px-5 pb-5">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
                className="flex-1 min-h-[44px] rounded-xl border border-brand-ink/10 text-brand-ink/60 font-semibold text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={commit}
                className="flex-1 min-h-[44px] rounded-xl bg-brand-sky text-white font-semibold text-sm"
              >
                Use date
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
