"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { tapScale } from "@/lib/motion";
import ContactMessageSheet from "@/components/shared/ContactMessageSheet";

export default function MessageButton({
  phone, parentName, childName, dateOfBirth, showLabel = false, className = "", canManageTemplates = false,
}: {
  phone: string;
  parentName: string;
  childName?: string;
  dateOfBirth?: string;
  showLabel?: boolean;
  className?: string;
  canManageTemplates?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <motion.button type="button" whileTap={tapScale} onClick={(event) => { event.stopPropagation(); setOpen(true); }} aria-label={`Message ${parentName}`} className={`flex items-center justify-center rounded-full border border-brand-leaf/30 bg-brand-leaf/10 p-1.5 text-brand-leaf transition-colors hover:bg-brand-leaf/15 ${className}`}>
      <MessageCircle size={13} />{showLabel && <span className="ml-1.5 text-xs font-semibold">Message</span>}
    </motion.button>
    {open && <ContactMessageSheet open onClose={() => setOpen(false)} title={`Message ${parentName}`} phone={phone}
      initialMessage="Hi {{parent_name}}! This is {{business_name}}. How can we help you today?" templateKey="customer_contact"
      templateValues={{ parent_name: parentName || "there", child_name: childName || "your child", date_of_birth: dateOfBirth, business_name: "QureoCity" }}
      canManageTemplates={canManageTemplates} />}
  </>;
}
