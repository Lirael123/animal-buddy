/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        grass: {
          DEFAULT: '#28C76F',
          deep: '#1FA85C',
          soft: '#8FE3B6',
          pale: '#E6F8EF',
        },
        mint: {
          DEFAULT: '#A8E6CF',
          soft: '#BFEFDB',
          light: '#D6F5E8',
          pale: '#EFFAF3',
        },
        sky: {
          bg: '#BFE9FF',
          pale: '#E3F4FF',
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
        wood: '#F7E7A8',
        woodline: '#D8B85E',
        pink: {
          DEFAULT: '#F48FB1',
          light: '#F8BBD0',
          pale: '#FDEDF3',
        },
        ink: '#2E3A45',
      },
      fontFamily: {
        round: ['"Baloo 2"', '"ZCOOL KuaiLe"', '"Comic Sans MS"', 'system-ui', 'sans-serif'],
        hand: ['"ZCOOL KuaiLe"', '"Baloo 2"', '"Comic Sans MS"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        soft: '0 10px 30px -8px rgba(40,150,90,0.22)',
        float: '0 18px 42px -12px rgba(40,140,90,0.38)',
        card: '0 12px 0 -4px rgba(0,0,0,0.06), 0 18px 34px -14px rgba(40,140,90,0.30)',
      },
      keyframes: {
        bob: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        fadeSlideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        breathe: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(40,199,111,0.45)' },
          '50%': { boxShadow: '0 0 0 18px rgba(40,199,111,0)' },
        },
        popIn: {
          '0%': { opacity: '0', transform: 'scale(0.7)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        eq: {
          '0%, 100%': { transform: 'scaleY(0.35)' },
          '50%': { transform: 'scaleY(1)' },
        },
      },
      animation: {
        bob: 'bob 2.6s ease-in-out infinite',
        'fade-slide-up': 'fadeSlideUp 0.45s ease-out both',
        breathe: 'breathe 1.5s ease-out infinite',
        'pop-in': 'popIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
        eq: 'eq 0.9s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};