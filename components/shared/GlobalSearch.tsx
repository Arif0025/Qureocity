"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  X,
  ArrowRight,
  User,
  HelpCircle,
  UserRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { helpArticlesFor } from "@/lib/help/articles";

export type SearchNavItem = {
  id: string;
  label: string;
  keywords?: string[];
};

type CustomerResult = {
  customer_id: string;
  parent_name: string;
  phone: string;
  children?: { id: string; name: string }[] | null;
};

type StaffPerson = { id: string; name: string; role: string };

type ResultRow = {
  key: string;
  section: "Go to" | "People" | "Staff" | "Help";
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  onSelect: () => void;
};

// Header search: one overlay, four sources merged into a flat, keyboard-
// navigable result list. Nav/staff/help are filtered client-side on every
// keystroke (all small, already-loaded lists); customer/child matches are
// debounced against the same RPC CustomerSearch already uses, so results
// stay within each person's existing read permissions.
export default function GlobalSearch({
  open,
  onClose,
  isAdmin,
  staff,
  navItems,
  onNavigate,
  onOpenCustomer,
  onOpenStaffEmployee,
  onOpenHelp,
}: {
  open: boolean;
  onClose: () => void;
  isAdmin: boolean;
  staff?: StaffPerson[];
  navItems: SearchNavItem[];
  onNavigate: (tabId: string) => void;
  onOpenCustomer: (phone: string) => void;
  onOpenStaffEmployee?: (employeeId: string) => void;
  onOpenHelp: (slug: string) => void;
}) {
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerResult[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const helpArticles = useMemo(() => helpArticlesFor(isAdmin), [isAdmin]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCustomerResults([]);
      setHighlighted(0);
      // Let the overlay mount before focusing, or the focus call is lost.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setCustomerResults([]);
      return;
    }
    setLoadingCustomers(true);
    const timeout = setTimeout(async () => {
      const { data } = await supabase.rpc("staff_search_customers", {
        p_query: q,
      });
      setCustomerResults(((data as CustomerResult[]) ?? []).slice(0, 6));
      setLoadingCustomers(false);
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  const rows: ResultRow[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: ResultRow[] = [];

    if (q.length >= 1) {
      navItems
        .filter(
          (n) =>
            n.label.toLowerCase().includes(q) ||
            (n.keywords ?? []).some((k) => k.toLowerCase().includes(q)),
        )
        .slice(0, 5)
        .forEach((n) =>
          out.push({
            key: `nav:${n.id}`,
            section: "Go to",
            title: n.label,
            icon: <ArrowRight size={15} />,
            onSelect: () => {
              onNavigate(n.id);
              onClose();
            },
          }),
        );
    }

    customerResults.forEach((c) => {
      const kids = (c.children ?? []).map((k) => k.name).join(", ");
      out.push({
        key: `cust:${c.customer_id}`,
        section: "People",
        title: c.parent_name,
        subtitle: kids ? `${c.phone} · ${kids}` : c.phone,
        icon: <User size={15} />,
        onSelect: () => {
          onOpenCustomer(c.phone);
          onClose();
        },
      });
    });

    if (isAdmin && staff && q.length >= 1) {
      staff
        .filter((s) => s.name.toLowerCase().includes(q))
        .slice(0, 5)
        .forEach((s) =>
          out.push({
            key: `staff:${s.id}`,
            section: "Staff",
            title: s.name,
            subtitle: s.role === "admin" ? "Admin" : "Staff",
            icon: <UserRound size={15} />,
            onSelect: () => {
              onOpenStaffEmployee?.(s.id);
              onClose();
            },
          }),
        );
    }

    if (q.length >= 1) {
      helpArticles
        .filter(
          (a) =>
            a.title.toLowerCase().includes(q) ||
            a.keywords.some((k) => k.toLowerCase().includes(q)),
        )
        .slice(0, 5)
        .forEach((a) =>
          out.push({
            key: `help:${a.slug}`,
            section: "Help",
            title: a.title,
            subtitle: a.category,
            icon: <HelpCircle size={15} />,
            onSelect: () => {
              onOpenHelp(a.slug);
              onClose();
            },
          }),
        );
    }

    return out;
  }, [
    query,
    navItems,
    customerResults,
    isAdmin,
    staff,
    helpArticles,
    onNavigate,
    onOpenCustomer,
    onOpenStaffEmployee,
    onOpenHelp,
    onClose,
  ]);

  useEffect(() => {
    setHighlighted(0);
  }, [rows.length]);

  if (!open) return null;

  const sections: ResultRow["section"][] = ["Go to", "People", "Staff", "Help"];
  const showEmpty =
    query.trim().length >= 1 && rows.length === 0 && !loadingCustomers;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-16 sm:pt-24 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-brand-nightSurface rounded-xl2 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
          <Search size={18} className="text-brand-nightText/40 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                onClose();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlighted((h) => Math.min(h + 1, rows.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlighted((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter") {
                rows[highlighted]?.onSelect();
              }
            }}
            placeholder="Search people, staff, help…"
            className="flex-1 min-h-[36px] bg-transparent text-brand-nightText placeholder:text-brand-nightText/35 text-base outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="text-brand-nightText/40 hover:text-brand-nightText p-1 rounded-lg shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-2">
          {query.trim().length === 0 && (
            <p className="px-4 py-6 text-sm text-brand-nightText/40 text-center">
              Start typing to search across people, staff, and help articles.
            </p>
          )}

          {sections.map((section) => {
            const items = rows.filter((r) => r.section === section);
            if (items.length === 0) return null;
            return (
              <div key={section} className="mb-1">
                <p className="px-4 pt-2 pb-1 text-[11px] font-semibold text-brand-nightText/35 uppercase tracking-wide">
                  {section}
                </p>
                {items.map((row) => {
                  const idx = rows.indexOf(row);
                  return (
                    <button
                      key={row.key}
                      type="button"
                      onMouseEnter={() => setHighlighted(idx)}
                      onClick={row.onSelect}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        idx === highlighted
                          ? "bg-brand-sky/10"
                          : "hover:bg-white/[0.03]"
                      }`}
                    >
                      <span className="text-brand-nightText/40 shrink-0">
                        {row.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-brand-nightText truncate">
                          {row.title}
                        </span>
                        {row.subtitle && (
                          <span className="block text-xs text-brand-nightText/45 truncate">
                            {row.subtitle}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}

          {loadingCustomers && (
            <p className="px-4 py-3 text-xs text-brand-nightText/35">
              Searching…
            </p>
          )}
          {showEmpty && (
            <p className="px-4 py-6 text-sm text-brand-nightText/40 text-center">
              No matches for &quot;{query.trim()}&quot;.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
