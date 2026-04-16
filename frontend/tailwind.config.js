/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        parchment: { DEFAULT: "#f5e6c8", dark: "#e8d5a3", ink: "#1c1410" },
        dnd: {
          red: "#8b2635",
          gold: "#c9a84c",
          dark: "#2a241c",
          darker: "#14110e",
          panel: "#1f1a15",
          border: "#4a3f32",
        },
      },
      fontFamily: {
        display: ["Cinzel", "serif"],
        body:    ["Crimson Text", "serif"],
        mono:    ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
