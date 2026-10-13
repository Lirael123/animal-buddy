/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        mint: {
          DEFAULT: '#8FD6B7',
          soft: '#A8E6CF',
          light: '#D6F5E8',
          pale: '#EFFAF3',
        },
        cream: {
          DEFAULT: '#FFF9EF',
          deep: '#FFF1DC',
        },
        orange: {
          DEFAULT: '#FFA24C',
          deep: '#F08A3C',
          light: '#FFD9B0',
        },
        pink: {
          DEFAULT: '#F48FB1',
          light: '#F8BBD0',
          pale: '#FDEDF3',
        },
        ink: '#4A3F5C',
      },
      fontFamily: {
        round: ['"Baloo 2"', '"ZCOOL KuaiLe"', '"Comic Sans MS"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        soft: '0 10px 30px -8px rgba(138, 99, 60, 0.25)',
        float: '0 16px 40px -10px rgba(138, 99, 60, 0.35)',
      },
      keyframes: {
        bob: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        fadeSlideUp: {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        breathe: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(255, 90, 90, 0.5)' },
          '50%': { boxShadow: '0 0 0 16px rgba(255, 90, 90, 0)' },
        },
        popIn: {
          '0%': { opacity: '0', transform: 'scale(0.7)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        bob: 'bob 2.4s ease-in-out infinite',
        'fade-slide-up': 'fadeSlideUp 0.4s ease-out both',
        breathe: 'breathe 1.4s ease-out infinite',
        'pop-in': 'popIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
      },
    },
  },
  plugins: [],
};