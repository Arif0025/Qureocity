// Four colorways sampled from the light/dark UI references. A plan ID picks
// one tone so the same plan keeps its visual identity in Customers and Plans.
export const PLAN_CARD_TONES = [
  {
    card: "border-brand-sky/30 bg-brand-sky/[0.08]",
    stripe: "border-l-brand-sky",
    badge: "bg-brand-sky/20 text-brand-skyLight",
  },
  {
    card: "border-brand-leaf/35 bg-brand-leaf/[0.08]",
    stripe: "border-l-brand-leaf",
    badge: "bg-brand-leaf/20 text-brand-leaf",
  },
  {
    card: "border-brand-coral/35 bg-brand-coral/[0.08]",
    stripe: "border-l-brand-coral",
    badge: "bg-brand-coral/20 text-brand-coral",
  },
  {
    card: "border-brand-sun/40 bg-brand-sun/[0.09]",
    stripe: "border-l-brand-sun",
    badge: "bg-brand-sun/25 text-brand-purpleDeep",
  },
] as const;

export function planCardTone(planId: string, orderedPlanIds?: readonly string[]) {
  // Use the visible list order when available so neighboring plan cards do
  // not collide just because their IDs happen to hash to the same tone.
  const orderedIndex = orderedPlanIds?.indexOf(planId) ?? -1;
  if (orderedIndex >= 0) return PLAN_CARD_TONES[orderedIndex % PLAN_CARD_TONES.length];

  let hash = 0;
  for (const character of planId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return PLAN_CARD_TONES[hash % PLAN_CARD_TONES.length];
}
