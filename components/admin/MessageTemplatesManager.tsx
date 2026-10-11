"use client";

import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import AnimatedSelect from "@/components/ui/AnimatedSelect";
import { invalidateMessageTemplateCache, loadMessageTemplates } from "@/lib/message-template-client";
import { MESSAGE_TEMPLATE_EVENTS, MESSAGE_TEMPLATE_VARIABLES, unsupportedTemplateTokens, type MessageTemplateEvent, type SavedMessageTemplate } from "@/lib/message-template-format";

const exampleValues: Record<string, string> = { parent_name: "Sam", child_name: "Alex", business_name: "QureoCity", plan_name: "Play Pass", request_type: "membership", event_date: "12 Oct", party_datetime: "12 Oct, 4:00 pm", quote_amount: "₹5,000", birthday_date: "12 Oct", checkout_time: "5:30 pm", expiry_date: "12 Oct" };

export default function MessageTemplatesManager() {
  const [eventKey, setEventKey] = useState<MessageTemplateEvent>("customer_contact");
  const [rows, setRows] = useState<SavedMessageTemplate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const supabase = useMemo(() => createClient(), []);

  const refresh = async (key: MessageTemplateEvent, preferredId?: string) => {
    setLoading(true);
    try {
      invalidateMessageTemplateCache(key);
      const next = await loadMessageTemplates(key);
      setRows(next);
      const chosen = next.find((item) => item.id === preferredId) ?? next.find((item) => item.is_default) ?? next[0];
      setSelectedId(chosen?.id ?? "");
      setName(chosen?.name ?? "");
      setBody(chosen?.body ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load message formats.");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    let active = true;
    void loadMessageTemplates(eventKey).then((next) => {
      if (!active) return;
      setRows(next);
      const chosen = next.find((item) => item.is_default) ?? next[0];
      setSelectedId(chosen?.id ?? "");
      setName(chosen?.name ?? "");
      setBody(chosen?.body ?? "");
      setError("");
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load message formats.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [eventKey]);

  const selectTemplate = (id: string) => {
    setSelectedId(id);
    const row = rows.find((item) => item.id === id);
    setName(row?.name ?? "");
    setBody(row?.body ?? "");
    setError(""); setNotice("");
  };
  const save = async (makeDefault: boolean) => {
    if (!name.trim() || !body.trim()) { setError("Enter a name and message first."); return; }
    const unsupported = unsupportedTemplateTokens(eventKey, body);
    if (unsupported.length) { setError(`Unknown placeholders: ${unsupported.map((key) => `{{${key}}}`).join(", ")}`); return; }
    setSaving(true); setError(""); setNotice("");
    const { data, error: saveError } = await supabase.rpc("admin_save_message_template", { p_id: selectedId || null, p_event_key: eventKey, p_name: name.trim(), p_body: body.trim(), p_make_default: makeDefault || Boolean(rows.find((item) => item.id === selectedId)?.is_default) });
    setSaving(false);
    if (saveError) { setError(saveError.message); return; }
    const savedId = (data as { id?: string } | null)?.id;
    await refresh(eventKey, savedId);
    setNotice(makeDefault ? "Saved as the default format." : "Format saved.");
  };
  const appendToken = (key: string) => setBody((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}{{${key}}}`);
  const preview = body.replace(/{{\s*([a-z][a-z0-9_]*)\s*}}/gi, (_match, key: string) => exampleValues[key] ?? `{{${key}}}`);

  return <section className="space-y-3 rounded-xl border border-white/[0.08] bg-brand-nightSurface2 p-3 sm:p-4">
    <header><h3 className="text-sm font-semibold text-brand-nightText">Saved message formats</h3><p className="mt-0.5 text-xs text-brand-nightText/45">Edit reusable messages and choose which one is used by default. Bracketed fields fill from the selected customer or request.</p></header>
    <div className="grid gap-3 sm:grid-cols-2">
      <AnimatedSelect label="Used for" value={eventKey} onChange={(value) => { setLoading(true); setNotice(""); setEventKey(value as MessageTemplateEvent); }} options={MESSAGE_TEMPLATE_EVENTS.map((item) => ({ value: item.key, label: item.label }))} />
      <AnimatedSelect label="Saved format" value={selectedId} onChange={selectTemplate} options={[{ value: "", label: "New format", hint: "Create another reusable message" }, ...rows.map((item) => ({ value: item.id, label: item.name, badge: item.is_default ? "Default" : undefined }))]} />
    </div>
    {loading ? <p className="py-3 text-sm text-brand-nightText/45">Loading formats…</p> : <>
      <label className="block space-y-1 text-xs text-brand-nightText/55">Format name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="For example: Membership approved" className="min-h-10 w-full rounded-lg border border-white/10 bg-brand-nightSurface px-3 text-sm text-brand-nightText" /></label>
      <label className="block space-y-1 text-xs text-brand-nightText/55">Message<textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} rows={4} className="w-full rounded-lg border border-white/10 bg-brand-nightSurface p-3 text-sm text-brand-nightText outline-none focus:border-brand-sky/50" /></label>
      <div><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-nightText/40">Insert fields</p><div className="flex flex-wrap gap-1.5">{(MESSAGE_TEMPLATE_VARIABLES[eventKey] ?? []).map((item) => <button key={item.key} type="button" onClick={() => appendToken(item.key)} className="min-h-8 rounded-full border border-white/10 px-2.5 text-[11px] font-medium text-brand-nightText/65 hover:bg-white/[0.05]">{item.label}</button>)}</div></div>
      <section aria-label="Personalized message preview" className="overflow-hidden rounded-xl border border-brand-leaf/35 bg-brand-leaf/[0.07] shadow-sm shadow-brand-leaf/5"><header className="border-b border-brand-leaf/15 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-leaf">Personalized preview</p><p className="mt-0.5 text-[11px] text-brand-nightText/45">Sample names and details show how placeholders will look when sent.</p></header><p className="whitespace-pre-wrap px-3 py-3 text-sm font-medium leading-6 text-brand-nightText">{preview || "Your personalized message preview will appear here."}</p></section>
      {error && <p role="alert" className="text-xs text-brand-coral">{error}</p>}{notice && <p role="status" className="text-xs text-brand-leaf">{notice}</p>}
      <div className="flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => void save(false)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-sky px-3 text-xs font-semibold text-white disabled:opacity-50"><Save size={14} />{saving ? "Saving…" : "Save format"}</button><button type="button" disabled={saving} onClick={() => void save(true)} className="min-h-10 rounded-lg border border-white/10 px-3 text-xs font-semibold text-brand-nightText disabled:opacity-50">Save as default</button></div>
    </>}
  </section>;
}
