import type { Config } from "tailwindcss";

// Shared theme tokens use sampled colors from the supplied light/dark UI
// references; page surfaces and controls consume these centralized values.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
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
        xl2: "1.25rem",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
