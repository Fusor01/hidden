import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 950: "#08142B", 900: "#0B1B3A", 800: "#13294F", 700: "#1D3A6B" },
        indigo: { 600: "#4F46E5", 700: "#4338CA", 50: "#EEF0FF" },
        teal: { 600: "#0D9488", 500: "#14B8A6", 50: "#E6F7F5" },
        paper: "#F6F7FB",
        line: "#E3E6EF",
        ink: { DEFAULT: "#14213D", soft: "#55607A" },
      },
      fontFamily: { sans: ["var(--font-inter)", "system-ui", "sans-serif"] },
      borderRadius: { DEFAULT: "6px", lg: "8px" },
      boxShadow: { card: "0 1px 2px rgba(11,27,58,.06)" },
    },
  },
  plugins: [],
} satisfies Config;
