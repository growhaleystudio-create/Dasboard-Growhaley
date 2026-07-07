import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-plus-jakarta-sans)', 'sans-serif'],
      },
      colors: {
        'primary-base': '#177cb3',
        'primary-hover': '#0f6f9f',
        'primary-accent': '#007fb9',
        'alpha-primary-10': 'rgba(23,124,179,0.10)',
        'text-strong-950': '#171717',
        'text-sub-600': '#5f6368',
        'text-soft-400': '#8c9198',
        'text-disabled-300': '#c7cbd1',
        'bg-white-0': '#ffffff',
        'bg-weak-50': '#f5f7fa',
        'bg-subtle': '#fbfcfe',
        'bg-accent-soft': '#eef8fc',
        'stroke-soft-200': '#e3e8ef',
        'stroke-strong-300': '#cdd5df',
        'state-danger-base': '#f04438',
        'state-danger-hover': '#d92d20',
        'state-danger-light': '#fef3f2',
        'state-danger-border': '#fecdca',
        'state-danger-dark': '#b42318',
        'state-warning-base': '#f79009',
        'state-warning-border': '#fedf89',
        'state-info-base': '#2e90fa',
        'state-info-border': '#b2ddff',
        'state-success-light': '#d1fadf',
        'state-success-bg': '#ecfdf3',
        'state-success-base': '#12b76a',
        'state-success-dark': '#027a48',
        'neutral-gray-200': '#e3e8ef',
      },
      borderRadius: {
        ui: '14px',
        panel: '20px',
      },
      boxShadow: {
        card: '0px 8px 20px rgba(15, 23, 42, 0.05)',
        panel: '0px 10px 24px rgba(15, 23, 42, 0.06)',
        focus: '0 0 0 4px rgba(23,124,179,0.14)',
      }
    },
  },
  plugins: [],
};

export default config;
