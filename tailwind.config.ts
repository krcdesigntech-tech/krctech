import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm coral — signature accent, replaces the old cool blue.
        primary: {
          DEFAULT: "#cc785c",
          hover: "#a9583e",
          light: "#f7e9e2",
          disabled: "#e6dfd8",
          50: "#fbf3ef",
          100: "#f7e9e2",
          500: "#cc785c",
          600: "#a9583e",
          700: "#8a4732",
        },
        status: {
          success: "#5db872",
          "success-light": "#e3f5e8",
          error: "#c64545",
          "error-light": "#f7e3e1",
          warning: "#d4a017",
          "warning-light": "#f9edcf",
          info: "#5db8a6",
          "info-light": "#e2f3f0",
        },
        // Cream-canvas surfaces & warm-ink text, mirrored from design.md.
        canvas: "#faf9f5",
        ink: "#141413",
        body: "#3d3d3a",
        "body-strong": "#252523",
        muted: "#6c6a64",
        "muted-soft": "#8e8b82",
        hairline: "#e6dfd8",
        "hairline-soft": "#ebe6df",
        surface: {
          soft: "#f5f0e8",
          card: "#efe9de",
          strong: "#e8e0d2",
          dark: "#181715",
          "dark-elevated": "#252320",
          "dark-soft": "#1f1e1b",
        },
        accent: {
          teal: "#5db8a6",
          amber: "#e8a55a",
        },
        // Override Tailwind's default cool gray with a warm-cream-tinted scale
        // so every existing bg-gray-*/text-gray-*/border-gray-* class in the
        // app retints automatically without touching each page.
        gray: {
          50: "#faf9f5",
          100: "#f5f0e8",
          200: "#e6dfd8",
          300: "#d7cec0",
          400: "#a39d8f",
          500: "#8e8b82",
          600: "#6c6a64",
          700: "#3d3d3a",
          800: "#252523",
          900: "#141413",
          950: "#0d0d0c",
        },
        // bg-white / text-white surfaces become the cream canvas tone.
        white: "#faf9f5",
      },
      fontFamily: {
        sans: ["var(--font-noto)", "Noto Sans KR", "sans-serif"],
        serif: ["var(--font-noto-serif)", "Noto Serif KR", "Georgia", "serif"],
      },
      borderRadius: {
        card: "12px",
        btn: "8px",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(20,20,19,0.04)",
        "card-hover": "0 1px 3px 0 rgba(20,20,19,0.08)",
        modal: "0 20px 40px -8px rgba(20,20,19,0.18)",
      },
      maxWidth: {
        container: "1160px",
      },
      width: {
        sidebar: "240px",
      },
      spacing: {
        sidebar: "240px",
      },
    },
  },
  plugins: [],
};
export default config;
