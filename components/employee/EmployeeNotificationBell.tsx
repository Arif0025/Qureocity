"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, BellRing, Check, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BottomSheet from "@/components/ui/BottomSheet";

type InboxItem = {
  id: string;
  category: "admin" | "system";
  title: string;
  body: string;
  target_url: string;
  created_at: string;
  read_at: string | null;
};

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function EmployeeNotificationBell({ onOpenLink }: { onOpenLink: (url: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const refreshUnread = useCallback(async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase.from("employee_notifications").select("id", { count: "exact", head: true }).is("read_at", null).gte("created_at", since);
    setUnreadCount(count ?? 0);
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ data, error }, { count }] = await Promise.all([
      supabase
        .from("employee_notifications")
        .select("id, category, title, body, target_url, created_at, read_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("employee_notifications").select("id", { count: "exact", head: true }).is("read_at", null).gte("created_at", since),
    ]);
    if (!error && data) {
      const rows = data as InboxItem[];
      setItems(rows.sort((a, b) => Number(b.category === "admin") - Number(a.category === "admin") || b.created_at.localeCompare(a.created_at)));
      setUnreadCount(count ?? rows.filter((row) => !row.read_at).length);
    }
    setLoading(false);
  }, [supabase]);

  // Only the small unread count is read in the background. The inbox rows
  // are fetched on demand when the employee opens the bell.
  useEffect(() => {
    void refreshUnread();
    const onFocus = () => { void refreshUnread(); };
    const onServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "push-foreground") setUnreadCount((value) => value + 1);
    };
    window.addEventListener("focus", onFocus);
    navigator.serviceWorker?.addEventListener("message", onServiceWorkerMessage);
    return () => {
      window.removeEventListener("focus", onFocus);
      navigator.serviceWorker?.removeEventListener("message", onServiceWorkerMessage);
    };
  }, [refreshUnread]);

  useEffect(() => {
    if (!open) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      const userId = data.session?.user.id;
      if (!active || !userId) return;
      channel = supabase
        .channel(`employee-inbox-${userId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "employee_notifications", filter: `user_id=eq.${userId}` }, () => { void load(); })
        .subscribe();
    });
    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [open, supabase, load]);

  const openInbox = () => {
    setOpen(true);
    void load();
  };

  const selectItem = async (item: InboxItem) => {
    if (!item.read_at) {
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row));
      setUnreadCount((value) => Math.max(0, value - 1));
      await supabase.rpc("employee_notification_mark_read", { p_id: item.id });
    }
    setOpen(false);
    onOpenLink(item.target_url);
  };

  const adminItems = items.filter((item) => item.category === "admin");
  const systemItems = items.filter((item) => item.category === "system");

  return <>
    <button type="button" onClick={openInbox} title="Notifications" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} className="relative rounded-lg p-2 text-brand-nightText/45 transition-colors hover:bg-white/[0.04] hover:text-brand-nightText">
      <Bell size={16} />
      {unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-coral px-1 text-[9px] font-bold leading-none text-white">{unreadCount > 9 ? "9+" : unreadCount}</span>}
    </button>
    <BottomSheet open={open} onClose={() => setOpen(false)} title="Notifications" floatAboveBottom>
      {loading && items.length === 0 ? <p className="py-8 text-center text-sm text-brand-nightText/45">Loading notifications…</p> : items.length === 0 ? <div className="py-10 text-center"><BellRing size={22} className="mx-auto text-brand-nightText/30" /><p className="mt-2 text-sm font-medium text-brand-nightText/60">You’re all caught up</p><p className="mt-1 text-xs text-brand-nightText/35">Admin messages and work alerts will appear here.</p></div> : <div className="space-y-4">
        {adminItems.length > 0 && <section><h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-coral"><ShieldAlert size={12} />From admin · priority</h3><div className="space-y-2">{adminItems.map((item) => <InboxRow key={item.id} item={item} onSelect={selectItem} />)}</div></section>}
        {systemItems.length > 0 && <section><h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-nightText/40">Work alerts</h3><div className="space-y-2">{systemItems.map((item) => <InboxRow key={item.id} item={item} onSelect={selectItem} />)}</div></section>}
      </div>}
    </BottomSheet>
  </>;
}

function InboxRow({ item, onSelect }: { item: InboxItem; onSelect: (item: InboxItem) => void }) {
  return <button type="button" onClick={() => void onSelect(item)} className={`w-full rounded-xl border p-3 text-left transition-colors ${item.category === "admin" ? "border-brand-coral/25 bg-brand-coral/[0.06]" : "border-white/10 bg-brand-nightSurface2/70"}`}>
    <span className="flex items-start gap-2"><span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><span className="text-sm font-semibold text-brand-nightText">{item.title}</span>{!item.read_at && <span className="h-1.5 w-1.5 rounded-full bg-brand-skyLight" />}</span>{item.body && <span className="mt-1 block text-xs leading-relaxed text-brand-nightText/55">{item.body}</span>}<span className="mt-1.5 block text-[10px] text-brand-nightText/35">{relativeTime(item.created_at)}</span></span>{item.read_at && <Check size={13} className="mt-0.5 shrink-0 text-brand-nightText/25" />}</span>
  </button>;
}
