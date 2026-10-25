import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

// Shared theme tokens use sampled colors from the supplied light/dark UI
// references; page surfaces and controls consume these centralized values.
// Tailwind 4 changed how space-*/divide-* work: the margin/border now goes on
// every child EXCEPT THE LAST (bottom/end), through a zero-specificity
// :where() selector, so a child's own mb-*/mt-* still wins. Tailwind 3 put it
// on every child except the first (top/start) with higher specificity, which
// stacks with a child's own margin and shifts layouts. These rules reproduce
// the 4.x behaviour exactly. (:where() needs Safari 14 / Chrome 88.)
type ColorTree = { [key: string]: string | ColorTree | ((o: { opacityValue?: string }) => string) };
function flattenColors(tree: ColorTree, prefix = ""): Record<string, string | ((o: { opacityValue?: string }) => string)> {
  const out: Record<string, string | ((o: { opacityValue?: string }) => string)> = {};
  for (const [key, value] of Object.entries(tree)) {
    const name = key === "DEFAULT" ? prefix : prefix ? `${prefix}-${key}` : key;
    if (value && typeof value === "object") Object.assign(out, flattenColors(value as ColorTree, name));
    else out[name || "DEFAULT"] = value as string;
  }
  return out;
}

const v4StackingPlugin = plugin(({ matchUtilities, theme }) => {
  // `:not(zzz)` adds element-selector specificity (0,0,1) so these rules beat
  // Tailwind 3's own `button/p/h1 { margin: 0 }` resets — in Tailwind 4 those
  // resets live in a lower cascade layer, so there it never mattered — while
  // staying below any class (a child's own mb-2 still wins).
  const notLast = ":where(& > :not(:last-child)):not(zzz)";
  matchUtilities(
    {
      "space-x": (value) => ({ [notLast]: { marginInlineEnd: value } }),
      "space-y": (value) => ({ [notLast]: { marginBlockEnd: value } }),
    },
    { values: theme("spacing"), supportsNegativeValues: true },
  );
  matchUtilities(
    {
      "divide-x": (value) => ({ [notLast]: { borderInlineStartWidth: "0px", borderInlineEndWidth: value } }),
      "divide-y": (value) => ({ [notLast]: { borderTopWidth: "0px", borderBottomWidth: value } }),
    },
    { values: theme("borderWidth") },
  );
  matchUtilities(
    { divide: (value) => ({ [notLast]: { borderColor: value } }) },
    { values: flattenColors(theme("borderColor") as ColorTree) as Record<string, string>, type: ["color", "any"] },
  );
});

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  // Hover styles only on devices that can actually hover. Tailwind 4 did
  // this by default; without it a tapped button stays "hovered" on touch.
  future: { hoverOnlyWhenSupported: true },
  // Replaced by v4StackingPlugin below.
  corePlugins: { space: false, divideWidth: false, divideColor: false },
  theme: {
    extend: {
      // Parity shims: the app was styled against Tailwind 4's defaults.
      // These keep Tailwind 3.4 (needed for older Safari/Chrome) rendering
      // identically without touching any component class names.
      opacity: { "8": "0.08", "12": "0.12" },
      borderColor: { DEFAULT: "currentColor" },
      ringWidth: { DEFAULT: "1px" },
      boxShadow: {
        sm: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
      },
      colors: {
        brand: {
          sun: "rgb(var(--palette-sun) / <alpha-value>)",
          sky: "rgb(var(--palette-sky) / <alpha-value>)",
          purpleDeep: "rgb(var(--palette-purple-deep) / <alpha-value>)",
          coral: "rgb(var(--palette-coral) / <alpha-value>)",
          leaf: "rgb(var(--palette-leaf) / <alpha-value>)",
          ink: "rgb(var(--palette-ink) / <alpha-value>)",
          cloud: "rgb(var(--palette-cloud) / <alpha-value>)",
          // Staff-facing UI (Admin, Employee) tokens — CSS-variable-backed
          // so the same `bg-brand-nightBg` / `text-brand-nightText` class
          // names used everywhere automatically follow the light/dark
          // toggle (see globals.css for the two value sets). The names
          // keep the "night" prefix for backwards compatibility with the
          // hundreds of existing usages, even though they now render
          // light-theme values too when data-theme="light" is set.
          nightBg: "rgb(var(--night-bg) / <alpha-value>)",
          nightSurface: "rgb(var(--night-surface) / <alpha-value>)",
          nightSurface2: "rgb(var(--night-surface-2) / <alpha-value>)",
          nightText: "rgb(var(--night-text) / <alpha-value>)",
          skyLight: "rgb(var(--sky-light) / <alpha-value>)",
        },
      },
      keyframes: {
        popIn: {
          "0%": { transform: "scale(0.9)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(-2deg)" },
          "50%": { transform: "rotate(2deg)" },
        },
      },
      animation: {
        popIn: "popIn 0.2s ease-out",
        wiggle: "wiggle 1.5s ease-in-out infinite",
      },
      borderRadius: {
        sm: "0.25rem",
        xl2: "1.25rem",
      },
    },
    // Not under `extend`: Tailwind 3 would merge these with its own default
    // stack, Tailwind 4 replaced it. Replacing keeps the font identical.
    fontFamily: {
      sans: ["Inter", "system-ui", "sans-serif"],
    },
  },
  plugins: [v4StackingPlugin],
};

export default config;
