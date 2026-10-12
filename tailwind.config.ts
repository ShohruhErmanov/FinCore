import type { Config } from 'tailwindcss';

/**
 * IT Live identity (docs: "IT iydenty.pdf").
 *
 *   01 Primary     Brand qizil   #FF2B00
 *   02 Secondary   Oltin sariq   #FFB800
 *   03 Dark        Tech navy     #0F1B2D
 *   04 Accent      Issiq to‘q    #FF8050
 *   05 Background  Krem oq       #F5F1EE
 *
 * Each scale keeps the identity's own steps where the sheet gives them and
 * fills the gaps between. Brand red 600 (#E62600) is the shade used under white
 * text: the pure #FF2B00 reaches only 3.7:1 against white, 600 clears 4.5:1.
 */
const brand = {
  50: '#FFF1ED',
  100: '#FFE1D8',
  200: '#FFBBA8',
  300: '#FF8C70',
  400: '#FF5C36',
  500: '#FF2B00',
  600: '#E62600',
  700: '#B81F00',
  800: '#8A1700',
  900: '#5C0F00',
  950: '#3D0A00',
};
const navy = {
  50: '#E8EEF5',
  100: '#D3DEEA',
  200: '#A9BED5',
  300: '#7A9DC0',
  400: '#4F7AA3',
  500: '#345D86',
  600: '#284B70',
  700: '#1E3A5C',
  800: '#16293F',
  900: '#0F1B2D',
  950: '#060D16',
};
const gold = {
  50: '#FFF8E0',
  100: '#FFF0BF',
  200: '#FFE180',
  300: '#FFD24D',
  400: '#FFC526',
  500: '#FFB800',
  600: '#CC8C00',
  // Darker than the sheet's #CC8C00 so warning text stays legible on gold-50.
  700: '#996600',
  800: '#7A5200',
  900: '#664400',
  950: '#3D2900',
};
const accent = {
  50: '#FFF2EC',
  100: '#FFE3D6',
  200: '#FFC4A8',
  300: '#FFA27C',
  400: '#FF9066',
  500: '#FF8050',
  600: '#E86A3A',
  700: '#D45828',
  800: '#A6401A',
  900: '#7A2800',
  950: '#4D1900',
};
/**
 * Warm greys from the background column (#F5F1EE, #B8B0AA, #6B6460), deepening
 * into Tech navy, so headings set in the darkest step read as the brand's ink.
 * 500 is a touch darker than the sheet's grey to keep small text at 4.5:1.
 */
const sand = {
  50: '#FAF8F6',
  100: '#F5F1EE',
  200: '#E9E3DE',
  300: '#D9D1CB',
  400: '#B8B0AA',
  500: '#77706B',
  600: '#6B6460',
  700: '#4A4541',
  800: '#1E3A5C',
  900: '#0F1B2D',
  950: '#060D16',
};
/** Steel blue from the navy column, for informational (not branded) accents. */
const steel = {
  50: '#EEF3F8',
  100: '#E8EEF5',
  200: '#C9D7E6',
  300: '#A3BCD5',
  400: '#7A9DC0',
  500: '#4F7AA3',
  600: '#3A6290',
  700: '#2B4D73',
  800: '#1E3A5C',
  900: '#0F1B2D',
  950: '#060D16',
};

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        primary: 'rgb(var(--primary) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',

        // Brand scales — prefer these names in new code.
        brand,
        navy: { DEFAULT: 'rgb(var(--navy) / <alpha-value>)', ...navy },
        gold,
        accent,
        sand,
        steel,

        /*
         * The screens were built on Tailwind's default palette (~500 class
         * names). Rather than rename them all, the defaults they use are
         * re-pointed at the identity: neutrals become the warm sand-to-navy
         * ramp, blue (the old primary) becomes brand red, sky (info) steel,
         * amber (warning) gold, red/rose (danger) the brand red, cyan (the
         * highlight on navy panels) gold and orange the warm accent. Green
         * stays green: profit and success need a colour the brand lacks.
         */
        slate: sand,
        blue: brand,
        sky: steel,
        cyan: gold,
        amber: gold,
        yellow: gold,
        orange: accent,
        red: brand,
        rose: brand,
      },
      borderRadius: { card: '18px' },
      boxShadow: {
        card: '0 1px 2px rgba(15, 27, 45, 0.04), 0 18px 42px -32px rgba(15, 27, 45, 0.28)',
        elevated: '0 2px 4px rgba(15, 27, 45, 0.04), 0 24px 60px -28px rgba(15, 27, 45, 0.32)',
      },
      fontFamily: { sans: ['Roboto', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      /*
       * The identity sets Roboto in Light, Regular, Medium and Bold only.
       * Semibold (600) would make the browser fall through to Bold, so it is
       * pinned to Medium — the weight the identity uses for emphasis.
       */
      fontWeight: { semibold: '500' },
    },
  },
  plugins: [],
} satisfies Config;
