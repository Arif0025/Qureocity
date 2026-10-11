"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageCircle, MessageSquareText, Save } from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";
import AnimatedSelect from "@/components/ui/AnimatedSelect";
import { waMeLink } from "@/lib/whatsapp";
import { invalidateMessageTemplateCache, loadAllMessageTemplates } from "@/lib/message-template-client";
import { MESSAGE_TEMPLATE_EVENTS, missingTemplateValues, renderMessageTemplate, unsupportedTemplateTokens, type MessageTemplateEvent, type MessageTemplateValues, type SavedMessageTemplate } from "@/lib/message-template-format";
import { createClient } from "@/lib/supabase/client";

export default function ContactMessageSheet({
  open, onClose, title, phone, initialMessage, templateKey, templateValues = {}, canManageTemplates = false,
  askBeforeSend = false, preferredTemplateName,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  phone: string;
  initialMessage: string;
  templateKey?: MessageTemplateEvent;
  templateValues?: MessageTemplateValues;
  canManageTemplates?: boolean;
  askBeforeSend?: boolean;
  preferredTemplateName?: string;
}) {
  const [message, setMessage] = useState(initialMessage);
  const [templates, setTemplates] = useState<SavedMessageTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(Boolean(templateKey));
  const [selectedId, setSelectedId] = useState("");
  const [confirmed, setConfirmed] = useState(!askBeforeSend);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!open) return;
    let active = true;
    if (templateKey) {
      void loadAllMessageTemplates().then((rows) => {
        if (!active) return;
        setTemplates(rows);
        // Pick the format that matches the action which opened this sheet.
        // Keep every saved format available in the selector as an override.
        const selected = rows.find((row) => row.event_key === templateKey && row.name === preferredTemplateName)
          ?? rows.find((row) => row.event_key === templateKey && row.is_default);
        if (selected) {
          setSelectedId(selected.id);
          setMessage(selected.body);
        }
      }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load saved formats."); }).finally(() => { if (active) setLoadingTemplates(false); });
    }
    return () => { active = false; };
  }, [open, initialMessage, askBeforeSend, templateKey, preferredTemplateName]);

  const rendered = renderMessageTemplate(message, templateValues);
  const missing = missingTemplateValues(message, templateValues);
  const activeTemplateKey = selectedId ? templates.find((item) => item.id === selectedId)?.event_key ?? templateKey : templateKey;
  const supported = activeTemplateKey ? unsupportedTemplateTokens(activeTemplateKey, message) : [];
  const eventLabel = MESSAGE_TEMPLATE_EVENTS.find((item) => item.key === templateKey)?.label;
  const selectedTemplate = templates.find((item) => item.id === selectedId);
  const sendDisabled = loadingTemplates || !rendered.trim() || missing.length > 0 || supported.length > 0;
  const chooseTemplate = (id: string) => {
    setSelectedId(id);
    setMessage(templates.find((item) => item.id === id)?.body ?? "");
  };
  const saveTemplate = async (makeDefault: boolean) => {
    if (!templateKey || !saveName.trim() || !message.trim()) return;
    const saveEventKey = selectedTemplate?.event_key ?? templateKey;
    const unsupported = unsupportedTemplateTokens(saveEventKey, message);
    if (unsupported.length) { setError(`Unknown placeholder${unsupported.length > 1 ? "s" : ""}: ${unsupported.map((item) => `{{${item}}}`).join(", ")}`); return; }
    setSaving(true); setError("");
    const { error: saveError } = await supabase.rpc("admin_save_message_template", {
      p_id: selectedId || null,
      p_event_key: saveEventKey,
      p_name: saveName.trim(),
      p_body: message.trim(),
      p_make_default: makeDefault || Boolean(templates.find((item) => item.id === selectedId)?.is_default),
    });
    setSaving(false);
    if (saveError) { setError(saveError.message); return; }
    invalidateMessageTemplateCache(templateKey);
    const rows = await loadAllMessageTemplates();
    setTemplates(rows);
    const saved = rows.find((row) => row.name === saveName.trim());
    if (saved) setSelectedId(saved.id);
    setSaveOpen(false);
  };
  const sendWhatsApp = () => { window.open(waMeLink(phone, rendered), "qureocity-whatsapp-send"); onClose(); };
  const sendSms = () => { window.location.href = `sms:${phone}${rendered.trim() ? `?body=${encodeURIComponent(rendered)}` : ""}`; onClose(); };

  return <BottomSheet open={open} onClose={onClose} title={title}>
    {!confirmed ? <div className="space-y-3">
      <p className="text-sm text-brand-nightText/70">The request has been declined. Would you like to prepare a message for the family?</p>
      <div className="grid grid-cols-2 gap-2"><button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-white/10 px-3 text-sm font-semibold text-brand-nightText/65">No, close</button><button type="button" onClick={() => setConfirmed(true)} className="min-h-11 rounded-xl bg-brand-sky px-3 text-sm font-semibold text-white">Yes, write message</button></div>
    </div> : <div className="space-y-3">
      {loadingTemplates && <p className="text-xs text-brand-nightText/40">Loading saved formats…</p>}
      {templates.length > 0 && <div className="space-y-1.5"><AnimatedSelect label={eventLabel ? `${eventLabel} format` : "Saved format"} value={selectedId} onChange={chooseTemplate} options={[{ value: "", label: "Custom message", hint: "Write a one-time message" }, ...templates.map((item) => ({ value: item.id, label: item.name, hint: MESSAGE_TEMPLATE_EVENTS.find((event) => event.key === item.event_key)?.label, badge: item.is_default ? item.event_key === templateKey ? "Default · suggested" : "Default" : undefined }))]} />{selectedTemplate && <span className="block text-[11px] text-brand-leaf">{selectedTemplate.is_default ? `Default for ${MESSAGE_TEMPLATE_EVENTS.find((item) => item.key === selectedTemplate.event_key)?.label ?? "this action"}` : `Format for ${MESSAGE_TEMPLATE_EVENTS.find((item) => item.key === selectedTemplate.event_key)?.label ?? "another action"}`}{selectedTemplate.event_key === templateKey ? "; selected automatically for this action." : "; selected manually."}</span>}</div>}
      <label className="block space-y-1 text-xs font-medium text-brand-nightText/55">Review and edit message<textarea value={message} disabled={loadingTemplates} onChange={(event) => setMessage(event.target.value)} rows={5} maxLength={2000} className="w-full resize-y rounded-xl border border-white/15 bg-brand-nightSurface2 p-3 text-sm text-brand-nightText outline-none focus:border-brand-sky disabled:opacity-60" /></label>
      {templateKey && <section aria-label="Personalized message preview" className="overflow-hidden rounded-xl border border-brand-leaf/35 bg-brand-leaf/[0.07] shadow-sm shadow-brand-leaf/5">
        <header className="flex items-center justify-between gap-2 border-b border-brand-leaf/15 px-3 py-2"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-leaf">Personalized preview</span>{selectedTemplate?.is_default && <span className="rounded-full bg-brand-leaf/15 px-2 py-0.5 text-[10px] font-semibold text-brand-leaf">Default</span>}</header>
        <p className="whitespace-pre-wrap px-3 py-3 text-sm font-medium leading-6 text-brand-nightText">{rendered || "Your personalized message will appear here."}</p>
      </section>}
      {(missing.length > 0 || supported.length > 0) && <p role="alert" className="text-xs text-brand-coral">{missing.length ? `Add values for: ${missing.join(", ")}. ` : ""}{supported.length ? `Unsupported placeholders: ${supported.join(", ")}.` : ""}</p>}
      {canManageTemplates && templateKey && <div>
        {!saveOpen ? <button type="button" onClick={() => { setSaveName(templates.find((row) => row.id === selectedId)?.name ?? ""); setSaveOpen(true); }} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-brand-nightText/75"><Save size={14} />Save as reusable format</button> : <div className="space-y-2 rounded-xl border border-white/10 p-3"><label className="block space-y-1 text-xs text-brand-nightText/55">Format name<input value={saveName} onChange={(event) => setSaveName(event.target.value)} maxLength={80} className="min-h-10 w-full rounded-lg border border-white/10 bg-brand-nightSurface2 px-3 text-sm text-brand-nightText" /></label><div className="flex flex-wrap gap-2"><button type="button" disabled={saving || !saveName.trim()} onClick={() => void saveTemplate(false)} className="min-h-9 rounded-lg bg-brand-sky px-3 text-xs font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save format"}</button><button type="button" disabled={saving || !saveName.trim()} onClick={() => void saveTemplate(true)} className="min-h-9 rounded-lg border border-white/10 px-3 text-xs font-semibold text-brand-nightText disabled:opacity-50">Save as default</button><button type="button" onClick={() => setSaveOpen(false)} className="min-h-9 px-2 text-xs text-brand-nightText/50">Cancel</button></div></div>}
      </div>}
      {error && <p role="alert" className="text-xs text-brand-coral">{error}</p>}
      <div className="grid grid-cols-2 gap-2"><button type="button" onClick={sendWhatsApp} disabled={sendDisabled} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-leaf px-3 text-sm font-semibold text-white disabled:opacity-45"><MessageCircle size={16} />WhatsApp</button><button type="button" onClick={sendSms} disabled={sendDisabled} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-3 text-sm font-semibold text-brand-nightText disabled:opacity-45"><MessageSquareText size={16} />SMS</button></div>
    </div>}
  </BottomSheet>;
}
