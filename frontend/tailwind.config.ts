import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        inter: ['var(--font-lato)', 'sans-serif'],
        lato: ['var(--font-lato)', 'sans-serif'],
      },
      colors: {
        'primary-base': '#187DB4',
        'primary-hover': '#0F6F9F',
        'primary-accent': '#007FB9',
        'alpha-primary-10': 'rgba(24,125,180,0.1)',
        'text-strong-950': '#171717',
        'text-sub-600': '#5c5c5c',
        'text-soft-400': '#a3a3a3',
        'text-disabled-300': '#d1d1d1',
        'bg-white-0': '#ffffff',
        'bg-weak-50': '#f7f7f7',
        'bg-subtle': '#fcfcfd',
        'stroke-soft-200': '#ebebeb',
        'state-danger-base': '#fb3748',
        'state-danger-hover': '#e93544',
        'state-danger-light': '#fff1f2',
        'state-danger-border': '#ffd5d8',
        'state-danger-dark': '#b42318',
        'state-warning-base': '#f97316',
        'state-warning-border': '#ffe0c2',
        'state-info-base': '#335cff',
        'state-info-border': '#d8e5ff',
        'state-success-light': '#c2f5da',
        'state-success-bg': '#ecfdf3',
        'state-success-base': '#1fc16b',
        'state-success-dark': '#0b4627',
        'neutral-gray-200': '#ebebeb',
      },
      borderRadius: {
        ui: '10px',
        panel: '12px',
      },
      boxShadow: {
        'card': '0px 10px 10px -5px rgba(23,23,23,0.02), 0px 6px 6px -3px rgba(23,23,23,0.04), 0px 3px 3px -1.5px rgba(23,23,23,0.04), 0px 1px 1px -0.5px rgba(23,23,23,0.04), 0px 0px 0px 1px rgba(23,23,23,0.02)',
      }
    },
  },
  plugins: [],
};

export default config;
