import type { Config } from 'tailwindcss';

/** Every legacy color alias resolves through runtime variables. This lets the
 * complete application switch themes without duplicating route markup. */
const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

function themedScale(name: string) {
  return Object.fromEntries(
    shades.map((shade) => [shade, `rgb(var(--${name}-${shade}) / <alpha-value>)`]),
  );
}

const navyNeutral = themedScale('neutral');
const softAccent = themedScale('accent');
const softSuccess = themedScale('success-scale');
const softDanger = themedScale('danger-scale');
const softWarning = themedScale('warning-scale');

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        sidebar: 'rgb(var(--sidebar) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        raised: 'rgb(var(--raised) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        primary: 'rgb(var(--primary) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',
        pearl: navyNeutral,
        accent: softAccent,
        brand: softAccent,
        navy: softAccent,
        steel: softAccent,
        sand: navyNeutral,
        slate: navyNeutral,
        blue: softAccent,
        sky: softAccent,
        cyan: softAccent,
        green: softSuccess,
        emerald: softSuccess,
        red: softDanger,
        rose: softDanger,
        amber: softWarning,
        yellow: softWarning,
      },
      borderRadius: { card: '22px' },
      boxShadow: {
        card: 'var(--neu-shadow-2)',
        elevated: 'var(--neu-shadow-3)',
      },
      fontFamily: { sans: ['Roboto', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      fontWeight: { semibold: '500' },
    },
  },
  plugins: [],
} satisfies Config;
