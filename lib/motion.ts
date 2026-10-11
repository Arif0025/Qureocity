// Shared animation constants. Every transition in the app should pull
// from here rather than inventing its own duration/easing — that's what
// makes the app FEEL consistent, not just look consistent. If the
// product's motion language ever needs to change (snappier, slower,
// different easing), it changes once, here.

export const EASE = [0.22, 1, 0.36, 1] as const; // a soft, confident ease-out

export const DURATION = {
  instant: 0.12,
  fast: 0.18,
  base: 0.26,
  slow: 0.4,
} as const;

// Collapsed <-> expanded card content (DrillCard), accordions, sheets.
export const expandCollapse = {
  initial: { height: 0, opacity: 0 },
  animate: { height: "auto", opacity: 1 },
  exit: { height: 0, opacity: 0 },
  transition: { duration: DURATION.base, ease: EASE },
};

// A row/card appearing in a list (staggers nicely as a group).
export const listItem = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: DURATION.fast, ease: EASE },
};

// Tab content crossfade (PageTransition).
export const tabContent = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: DURATION.fast, ease: EASE },
};

// Modal / bottom sheet backdrop + panel.
export const sheetBackdrop = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: DURATION.fast },
};
export const sheetPanelMobile = {
  initial: { y: "100%" },
  animate: { y: 0 },
  exit: { y: "100%" },
  transition: { duration: DURATION.base, ease: EASE },
};
export const sheetPanelDesktop = {
  initial: { opacity: 0, scale: 0.97, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: 8 },
  transition: { duration: DURATION.fast, ease: EASE },
};

// Standard press feedback for anything tappable — the thing that makes
// an interface feel "snappy" rather than "okay": immediate, tiny visual
// acknowledgment on every tap, everywhere, not just a few places.
export const tapScale = { scale: 0.97 };
