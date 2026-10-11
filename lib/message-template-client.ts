"use client";

import { createClient } from "@/lib/supabase/client";
import type { MessageTemplateEvent, SavedMessageTemplate } from "@/lib/message-template-format";

const cache = new Map<string, Promise<SavedMessageTemplate[]>>();
let allTemplatesRequest: Promise<SavedMessageTemplate[]> | undefined;

export function loadMessageTemplates(eventKey: MessageTemplateEvent): Promise<SavedMessageTemplate[]> {
  const cached = cache.get(eventKey);
  if (cached) return cached;
  const request = (async () => {
    const { data, error } = await createClient()
      .from("message_templates")
      .select("id, event_key, name, body, is_default, updated_at")
      .eq("event_key", eventKey)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true });
      if (error) {
        cache.delete(eventKey);
        throw error;
      }
      return (data as SavedMessageTemplate[]) ?? [];
  })();
  cache.set(eventKey, request);
  return request;
}

export function loadAllMessageTemplates(): Promise<SavedMessageTemplate[]> {
  if (allTemplatesRequest) return allTemplatesRequest;
  allTemplatesRequest = (async () => {
    const { data, error } = await createClient()
      .from("message_templates")
      .select("id, event_key, name, body, is_default, updated_at")
      .eq("is_active", true)
      .order("event_key", { ascending: true })
      .order("is_default", { ascending: false })
      .order("name", { ascending: true });
    if (error) {
      allTemplatesRequest = undefined;
      throw error;
    }
    return (data as SavedMessageTemplate[]) ?? [];
  })();
  return allTemplatesRequest;
}

export function invalidateMessageTemplateCache(eventKey?: MessageTemplateEvent): void {
  allTemplatesRequest = undefined;
  if (eventKey) cache.delete(eventKey);
  else cache.clear();
}
