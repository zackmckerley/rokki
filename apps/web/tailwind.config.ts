import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      inherit: "inherit",
      bg: {
        0: "var(--bg-0)",
        1: "var(--bg-1)",
        2: "var(--bg-2)",
        3: "var(--bg-3)",
        4: "var(--bg-4)",
      },
      border: {
        DEFAULT: "var(--border)",
        strong: "var(--border-strong)",
        focus: "var(--border-focus)",
      },
      text: {
        0: "var(--text-0)",
        1: "var(--text-1)",
        2: "var(--text-2)",
        3: "var(--text-3)",
        disabled: "var(--text-disabled)",
      },
      accent: {
        DEFAULT: "var(--accent)",
        hover: "var(--accent-hover)",
        active: "var(--accent-active)",
        subtle: "var(--accent-subtle)",
      },
      success: {
        DEFAULT: "var(--success)",
        subtle: "var(--success-subtle)",
      },
      warning: {
        DEFAULT: "var(--warning)",
        subtle: "var(--warning-subtle)",
      },
      danger: {
        DEFAULT: "var(--danger)",
        subtle: "var(--danger-subtle)",
      },
      info: {
        DEFAULT: "var(--info)",
        subtle: "var(--info-subtle)",
      },
    },
    fontFamily: {
      sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      mono: ["var(--font-mono)", "ui-monospace", "Menlo", "monospace"],
      serif: ["var(--font-serif)", "Georgia", "serif"],
    },
    fontSize: {
      "2xs": ["var(--text-2xs)", { lineHeight: "var(--leading-2xs)" }],
      xs: ["var(--text-xs)", { lineHeight: "var(--leading-xs)" }],
      sm: ["var(--text-sm)", { lineHeight: "var(--leading-sm)" }],
      base: ["var(--text-base)", { lineHeight: "var(--leading-base)" }],
      md: ["var(--text-md)", { lineHeight: "var(--leading-md)" }],
      lg: ["var(--text-lg)", { lineHeight: "var(--leading-lg)" }],
      xl: ["var(--text-xl)", { lineHeight: "var(--leading-xl)" }],
      "2xl": ["var(--text-2xl)", { lineHeight: "var(--leading-2xl)" }],
      "3xl": ["var(--text-3xl)", { lineHeight: "var(--leading-3xl)" }],
    },
    spacing: {
      0: "0",
      0.5: "2px",
      1: "4px",
      2: "8px",
      3: "12px",
      4: "16px",
      5: "20px",
      6: "24px",
      8: "32px",
      10: "40px",
      12: "48px",
      16: "64px",
      20: "80px",
      24: "96px",
    },
    borderRadius: {
      none: "0",
      sm: "4px",
      DEFAULT: "6px",
      md: "8px",
      lg: "12px",
      full: "9999px",
    },
    extend: {
      // The custom `spacing` scale above (which padding/margin/gap read
      // from) intentionally omits half-steps to keep density tight. But
      // width/height ALSO read from spacing, so icon/dot SIZING classes
      // like h-3.5/w-3.5 (14px) and h-1.5/w-1.5 (6px) produced no CSS and
      // collapsed — icons fell back to their 24px intrinsic size, and dots
      // (priority / status / online / section) rendered at 0 and vanished.
      // Re-add ONLY the fractional sizes to width + height so icons and
      // dots size correctly, WITHOUT touching padding/gap (no loosening).
      width: { 1.5: "6px", 2.5: "10px", 3.5: "14px" },
      height: { 1.5: "6px", 2.5: "10px", 3.5: "14px" },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.2, 0, 0, 1)",
      },
      transitionDuration: {
        micro: "120ms",
        DEFAULT: "180ms",
        medium: "240ms",
        page: "360ms",
      },
    },
  },
  plugins: [],
} satisfies Config;
