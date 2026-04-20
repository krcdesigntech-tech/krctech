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
        primary: {
          DEFAULT: "#3366FF",
          hover: "#2952CC",
          light: "#EEF2FF",
          50: "#F0F4FF",
          100: "#E0E9FF",
          500: "#3366FF",
          600: "#2952CC",
          700: "#1F3D99",
        },
        status: {
          success: "#16A34A",
          "success-light": "#DCFCE7",
          error: "#DC2626",
          "error-light": "#FEE2E2",
          warning: "#D97706",
          "warning-light": "#FEF3C7",
          info: "#2563EB",
          "info-light": "#DBEAFE",
        },
      },
      fontFamily: {
        sans: ["var(--font-noto)", "Noto Sans KR", "sans-serif"],
      },
      borderRadius: {
        card: "16px",
        btn: "8px",
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.04)",
        "card-hover": "0 4px 12px 0 rgba(0,0,0,0.10)",
        modal: "0 20px 40px -8px rgba(0,0,0,0.15)",
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
