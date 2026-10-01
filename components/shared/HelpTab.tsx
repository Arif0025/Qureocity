"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { helpArticlesFor, type HelpArticle } from "@/lib/help/articles";

// Simple list → detail help section. Content is static (lib/help/articles.ts);
// this component is just the browsing UI. initialSlug lets a search result
// or a shared link open straight to one article.
export default function HelpTab({
  isAdmin,
  initialSlug,
  onOpenArticle,
}: {
  isAdmin: boolean;
  initialSlug?: string | null;
  // Called when the person opens an article, so the parent can put the
  // slug in the URL (?tab=help&article=slug) for back-button support.
  onOpenArticle: (slug: string | null) => void;
}) {
  const articles = useMemo(() => helpArticlesFor(isAdmin), [isAdmin]);
  const [query, setQuery] = useState("");

  const active: HelpArticle | null = initialSlug
    ? (articles.find((a) => a.slug === initialSlug) ?? null)
    : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.keywords.some((k) => k.toLowerCase().includes(q)) ||
        a.body.toLowerCase().includes(q),
    );
  }, [articles, query]);

  const grouped = useMemo(() => {
    const byCategory = new Map<string, HelpArticle[]>();
    for (const a of filtered) {
      const list = byCategory.get(a.category) ?? [];
      list.push(a);
      byCategory.set(a.category, list);
    }
    return Array.from(byCategory.entries());
  }, [filtered]);

  if (active) {
    return (
      <div className="max-w-2xl">
        <button
          type="button"
          onClick={() => onOpenArticle(null)}
          className="flex items-center gap-1.5 text-sm font-medium text-brand-nightText/50 hover:text-brand-nightText mb-4 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Help
        </button>
        <p className="text-xs font-semibold text-brand-nightText/40 uppercase tracking-wide mb-1">
          {active.category}
        </p>
        <h1 className="text-lg font-bold text-brand-nightText mb-4">
          {active.title}
        </h1>
        <div className="bg-brand-nightSurface rounded-xl2 shadow-sm p-5 space-y-3">
          {active.body.split("\n\n").map((para, i) => (
            <p
              key={i}
              className="text-sm text-brand-nightText/75 leading-relaxed"
            >
              {para}
            </p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-brand-nightText mb-4">Help</h1>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search help articles…"
        className="w-full min-h-[44px] rounded-xl2 border-2 border-white/15 bg-brand-nightSurface2 text-brand-nightText px-4 text-base mb-5"
      />
      {grouped.length === 0 && (
        <p className="text-sm text-brand-nightText/50">
          No help articles match that search.
        </p>
      )}
      <div className="space-y-6">
        {grouped.map(([category, items]) => (
          <div key={category}>
            <p className="text-xs font-semibold text-brand-nightText/40 uppercase tracking-wide mb-2">
              {category}
            </p>
            <div className="bg-brand-nightSurface rounded-xl2 shadow-sm divide-y divide-white/8">
              {items.map((a) => (
                <button
                  key={a.slug}
                  type="button"
                  onClick={() => onOpenArticle(a.slug)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
                >
                  <span className="text-sm text-brand-nightText">
                    {a.title}
                  </span>
                  <ChevronRight
                    size={16}
                    className="text-brand-nightText/30 shrink-0"
                  />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
