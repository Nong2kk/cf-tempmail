import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        honey: {
          300: "#FCD34D",
          400: "#FACC15",
          500: "#F59E0B",
          600: "#D97706",
        },
        navy: {
          900: "#0F172A",
          800: "#111827",
          700: "#1E293B",
        },
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
