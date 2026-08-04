"use client";

import { useState, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Send, Image as ImageIcon, X, Check, ChevronRight } from "lucide-react";

type Candidate = {
  customer_id: string;
  parent_name: string;
  phone: string;
  child_id: string;
  child_name: string;
  age: number;
  subscription_active: boolean;
  subscription_expires_on: string | null;
  last_visit_date: string | null;
  visit_count: number;
};

type Filters = {
  subscriptionStatus: "" | "active" | "expired" | "expiring_soon" | "never";
  expiringWithinDays: string;
  visitRecency: "" | "no_visit_in" | "visited_in";
  visitRecencyDays: string;
  minAge: string;
  maxAge: string;
  minVisits: string;
  maxVisits: string;
};

const EMPTY_FILTERS: Filters = {
  subscriptionStatus: "",
  expiringWithinDays: "7",
  visitRecency: "",
  visitRecencyDays: "30",
  minAge: "",
  maxAge: "",
  minVisits: "",
  maxVisits: "",
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// {parent_name}, {child_name}, {expiry_date} are the only fields wired
// up on purpose — kept to non-sensitive fields, per what was agreed.
function fillTemplate(template: string, c: Candidate): string {
  return template
    .replaceAll("{parent_name}", c.parent_name)
    .replaceAll("{child_name}", c.child_name)
    .replaceAll("{expiry_date}", fmtDate(c.subscription_expires_on));
}

function toE164(phone: string): string {
  // wa.me needs digits only, country code included, no leading +/00.
  // Customer phones are stored as entered — assume India (+91) if no
  // country code looks present (10 bare digits).
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export default function BroadcastWhatsApp() {
  const supabase = createClient();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [template, setTemplate] = useState(
    "Hi {parent_name}! Just a heads up that {child_name}'s membership at QureoCity expires on {expiry_date}. Renew anytime at the front desk to keep the fun going! 🎉",
  );
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const rowKey = (c: Candidate) => `${c.customer_id}:${c.child_id}`;

  const applyFilters = async () => {
    setLoading(true);
    setSearched(true);
    setSelected(new Set());
    setSentIds(new Set());
    const { data, error } = await supabase.rpc("broadcast_candidates", {
      p_subscription_status: filters.subscriptionStatus || null,
      p_expiring_within_days: filters.expiringWithinDays
        ? parseInt(filters.expiringWithinDays, 10)
        : null,
      p_visit_recency: filters.visitRecency || null,
      p_visit_recency_days: filters.visitRecencyDays
        ? parseInt(filters.visitRecencyDays, 10)
        : null,
      p_min_age: filters.minAge ? parseInt(filters.minAge, 10) : null,
      p_max_age: filters.maxAge ? parseInt(filters.maxAge, 10) : null,
      p_min_visits: filters.minVisits ? parseInt(filters.minVisits, 10) : null,
      p_max_visits: filters.maxVisits ? parseInt(filters.maxVisits, 10) : null,
    });
    setLoading(false);
    if (!error) setCandidates((data as Candidate[]) ?? []);
  };

  const toggleSelected = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(candidates.map(rowKey)));
  const selectNone = () => setSelected(new Set());

  const selectedCandidates = useMemo(
    () => candidates.filter((c) => selected.has(rowKey(c))),
    [candidates, selected],
  );
  const nextUnsent = selectedCandidates.find((c) => !sentIds.has(rowKey(c)));

  const openWhatsApp = (c: Candidate) => {
    const text = encodeURIComponent(fillTemplate(template, c));
    const phone = toE164(c.phone);
    window.open(`https://wa.me/${phone}?text=${text}`, "_blank");
    setSentIds((prev) => new Set(prev).add(rowKey(c)));
  };

  const insertPlaceholder = (token: string) => {
    setTemplate((t) => `${t}${t.endsWith(" ") || t === "" ? "" : " "}${token}`);
  };

  const handlePosterUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPosterPreview(URL.createObjectURL(file));
  };

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="bg-brand-nightSurface rounded-2xl border border-white/10 p-4 space-y-4">
        <p className="text-sm font-semibold text-brand-nightText">Filters</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-brand-nightText/50 block mb-1">
              Subscription status
            </label>
            <select
              value={filters.subscriptionStatus}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  subscriptionStatus: e.target
                    .value as Filters["subscriptionStatus"],
                }))
              }
              className="w-full min-h-[40px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText text-sm px-3"
            >
              <option value="">Any</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="expiring_soon">Expiring soon</option>
              <option value="never">Never subscribed</option>
            </select>
          </div>
          {filters.subscriptionStatus === "expiring_soon" && (
            <div>
              <label className="text-xs text-brand-nightText/50 block mb-1">
                Within how many days?
              </label>
              <input
                type="number"
                min={1}
                value={filters.expiringWithinDays}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    expiringWithinDays: e.target.value,
                  }))
                }
                className="w-full min-h-[40px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText text-sm px-3"
              />
            </div>
          )}

          <div>
            <label className="text-xs text-brand-nightText/50 block mb-1">
              Visit recency
            </label>
            <select
              value={filters.visitRecency}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  visitRecency: e.target.value as Filters["visitRecency"],
                }))
              }
              className="w-full min-h-[40px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText text-sm px-3"
            >
              <option value="">Any</option>
              <option value="no_visit_in">No visit in the last N days</option>
              <option value="visited_in">Visited in the last N days</option>
            </select>
          </div>
          {filters.visitRecency && (
            <div>
              <label className="text-xs text-brand-nightText/50 block mb-1">
                N days
              </label>
              <input
                type="number"
                min={1}
                value={filters.visitRecencyDays}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    visitRecencyDays: e.target.value,
                  }))
                }
                className="w-full min-h-[40px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText text-sm px-3"
              />
            </div>
          )}

          <div>
            <label className="text-xs text-brand-nightText/50 block mb-1">
              Child age range
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="Min"
                value={filters.minAge}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, minAge: e.target.value }))
                }
                className="w-full min-h-[40px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText text-sm px-3"
              />
              <span className="text-brand-nightText/30 text-xs shrink-0">
                to
              </span>
              <input
                type="number"
                placeholder="Max"
                value={filters.maxAge}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, maxAge: e.target.value }))
                }
                className="w-full min-h-[40px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText text-sm px-3"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-brand-nightText/50 block mb-1">
              Total visits
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="Min"
                value={filters.minVisits}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, minVisits: e.target.value }))
                }
                className="w-full min-h-[40px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText text-sm px-3"
              />
              <span className="text-brand-nightText/30 text-xs shrink-0">
                to
              </span>
              <input
                type="number"
                placeholder="Max"
                value={filters.maxVisits}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, maxVisits: e.target.value }))
                }
                className="w-full min-h-[40px] rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText text-sm px-3"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={applyFilters}
            disabled={loading}
            className="min-h-[40px] px-4 rounded-xl2 bg-brand-sky text-white text-sm font-semibold hover:bg-brand-sky/90 disabled:opacity-50"
          >
            {loading ? "Searching…" : "Apply filters"}
          </button>
          <button
            type="button"
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="min-h-[40px] px-4 rounded-xl2 border border-white/15 text-brand-nightText/50 text-sm font-medium"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Results + selection */}
      {searched && (
        <div className="bg-brand-nightSurface rounded-2xl border border-white/10 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-sm font-semibold text-brand-nightText">
              {candidates.length} match{candidates.length === 1 ? "" : "es"}
            </p>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="text-xs font-semibold text-brand-sky hover:underline"
              >
                Select all
              </button>
              <button
                onClick={selectNone}
                className="text-xs font-semibold text-brand-nightText/40 hover:underline"
              >
                Clear
              </button>
            </div>
          </div>

          {candidates.length === 0 && !loading && (
            <p className="text-sm text-brand-nightText/40">
              No families match these filters.
            </p>
          )}

          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {candidates.map((c) => {
              const key = rowKey(c);
              const isSelected = selected.has(key);
              const isSent = sentIds.has(key);
              return (
                <label
                  key={key}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer ${
                    isSelected ? "bg-brand-sky/10" : "hover:bg-white/[0.04]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelected(key)}
                    className="accent-brand-sky w-4 h-4 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-brand-nightText truncate">
                      {c.child_name}{" "}
                      <span className="text-brand-nightText/40">
                        · {c.parent_name}
                      </span>
                    </p>
                    <p className="text-xs text-brand-nightText/35">
                      {c.phone}
                      {c.subscription_expires_on &&
                        ` · expires ${fmtDate(c.subscription_expires_on)}`}
                    </p>
                  </div>
                  {isSent && (
                    <Check size={14} className="text-brand-leaf shrink-0" />
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Template */}
      <div className="bg-brand-nightSurface rounded-2xl border border-white/10 p-4 space-y-3">
        <p className="text-sm font-semibold text-brand-nightText">Message</p>
        <textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-white/15 bg-brand-nightSurface2 text-brand-nightText text-sm p-3 resize-none"
        />
        <div className="flex flex-wrap gap-1.5">
          {["{parent_name}", "{child_name}", "{expiry_date}"].map((tok) => (
            <button
              key={tok}
              type="button"
              onClick={() => insertPlaceholder(tok)}
              className="text-xs font-mono px-2 py-1 rounded-md bg-white/8 text-brand-nightText/60 hover:bg-brand-sky/15 hover:text-brand-skyLight"
            >
              {tok}
            </button>
          ))}
        </div>

        {/* Poster attachment — WhatsApp click-to-chat links (wa.me) can
            only pre-fill text, not attach media. This preview is so the
            admin can pick/confirm the right poster before sending, but
            attaching it to the chat is a manual tap inside WhatsApp
            itself once it opens — same as the Send tap they're already
            doing. */}
        <div>
          <label className="text-xs text-brand-nightText/50 block mb-1.5">
            Poster (optional — for reference; WhatsApp requires attaching it
            manually once the chat opens, since links can't carry images)
          </label>
          {posterPreview ? (
            <div className="relative w-32">
              <img
                src={posterPreview}
                alt="Poster preview"
                className="rounded-lg border border-white/15 w-32 h-32 object-cover"
              />
              <button
                onClick={() => setPosterPreview(null)}
                className="absolute -top-2 -right-2 bg-brand-nightSurface2 border border-white/15 rounded-full p-1 text-brand-nightText/60"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 text-xs text-brand-nightText/50 border border-dashed border-white/20 rounded-lg px-3 py-2.5 hover:border-brand-sky/40"
            >
              <ImageIcon size={14} />
              Upload poster
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePosterUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Send flow */}
      {selectedCandidates.length > 0 && (
        <div className="sticky bottom-4 bg-brand-nightSurface rounded-2xl border border-brand-sky/30 p-4 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-brand-nightText">
              <span className="font-bold">
                {sentIds.size}/{selectedCandidates.length}
              </span>{" "}
              sent
            </p>
            {nextUnsent ? (
              <button
                onClick={() => openWhatsApp(nextUnsent)}
                className="flex items-center gap-1.5 min-h-[40px] px-4 rounded-xl2 bg-brand-leaf text-white text-sm font-semibold hover:bg-brand-leaf/90"
              >
                <Send size={14} />
                Send to {nextUnsent.parent_name}
                <ChevronRight size={14} />
              </button>
            ) : (
              <p className="text-sm text-brand-leaf font-semibold flex items-center gap-1.5">
                <Check size={14} /> All done
              </p>
            )}
          </div>
          {nextUnsent && (
            <p className="text-xs text-brand-nightText/35 mt-2">
              Opens WhatsApp with the message pre-filled — you still tap Send
              inside WhatsApp yourself.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
