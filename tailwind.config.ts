import type { Config } from 'tailwindcss';

/** FinCore Deep Navy Soft UI tokens. Existing utility aliases are intentionally
 * retained so every route migrates without changing component behaviour. */
const navyNeutral = {
  50: '#1C2C44',
  100: '#213149',
  200: '#2B3E58',
  300: '#3F5571',
  400: '#7890AE',
  500: '#96ABC4',
  600: '#B3C4DB',
  700: '#CEDDF0',
  800: '#EDF4FF',
  900: '#F5F8FF',
  950: '#FFFFFF',
};

const softAccent = {
  50: '#1A2F4D',
  100: '#203B60',
  200: '#294D7A',
  300: '#38659D',
  400: '#527FCA',
  500: '#6F9FFF',
  600: '#6393EE',
  700: '#82ADFF',
  800: '#A4C2FF',
  900: '#C8DAFF',
  950: '#EDF4FF',
};

const softSuccess = {
  50: '#19382E',
  100: '#21483A',
  200: '#315F4E',
  300: '#477B65',
  400: '#5FA683',
  500: '#6EE3AE',
  600: '#7DE7B8',
  700: '#92ECC5',
  800: '#B5F3D5',
  900: '#D7FAE8',
  950: '#ECFFF5',
};

const softDanger = {
  50: '#472733',
  100: '#572B39',
  200: '#71394A',
  300: '#954B60',
  400: '#CA6579',
  500: '#FF8C9C',
  600: '#FF98A6',
  700: '#FFAAB5',
  800: '#FFC1C9',
  900: '#FFE1E5',
  950: '#FFF1F3',
};

const softWarning = {
  50: '#403421',
  100: '#513F25',
  200: '#6A512D',
  300: '#8A683A',
  400: '#BB8E51',
  500: '#F2BE73',
  600: '#F4C680',
  700: '#F5CB8D',
  800: '#F8DCB1',
  900: '#FCECD5',
  950: '#FFF7E8',
};

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
        card: '8px 8px 18px rgb(10 20 37 / 0.85), -8px -8px 18px rgb(43 62 88 / 0.7)',
        elevated: '14px 14px 34px rgb(10 20 37 / 0.88), -10px -10px 26px rgb(43 62 88 / 0.72)',
      },
      fontFamily: { sans: ['Roboto', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      fontWeight: { semibold: '500' },
    },
  },
  plugins: [],
} satisfies Config;
