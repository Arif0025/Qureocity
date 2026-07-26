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
          sun: "#FFC700",      // exact gold from the logo's sun rays
          sky: "#9A66AF",      // exact purple from the logo — now the primary color
          purpleDeep: "#5B3A73", // darker tint for headings/emphasis
          coral: "#FF6B6B",    // alerts / overdue
          leaf: "#3DD68C",     // success / active-and-fine
          ink: "#3A2E42",      // body text — dark, purple-tinted rather than plain gray
          cloud: "#FFF9F0",    // warm cream background instead of sterile white
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
