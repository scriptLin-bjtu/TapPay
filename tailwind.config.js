/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#6851ff',
          light: '#8271f3',
          dark: '#5240cc',
          muted: '#6851ff1a',
        },
        surface: {
          DEFAULT: '#141419',
          dark: '#0b0b0f',
          light: '#1c1c24',
          hover: '#1e1e28',
          border: '#2a2a36',
        },
        text: {
          primary: '#f0f0f5',
          secondary: '#8b8b9e',
          muted: '#5c5c6f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
