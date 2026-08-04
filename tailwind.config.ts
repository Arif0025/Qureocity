import type { Config } from "tailwindcss";

// NOTE: these are placeholder hex values inspired by a bright, playful
// indoor-play-space palette (sunny yellow / sky blue / coral / deep navy
// text). Swap them for the exact brand hex codes from qureocity.com once
// you send them over — everything downstream reads from these tokens,
// so it's a one-file change.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          sun: "#FFC700", // exact gold from the logo's sun rays
          sky: "#9A66AF", // exact purple from the logo — now the primary color
          purpleDeep: "#5B3A73", // darker tint for headings/emphasis
          coral: "#FF6B6B", // alerts / overdue
          leaf: "#3DD68C", // success / active-and-fine
          ink: "#3A2E42", // body text — dark, purple-tinted rather than plain gray
          cloud: "#FFF9F0", // warm cream background instead of sterile white
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
