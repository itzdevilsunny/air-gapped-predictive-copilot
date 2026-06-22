/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        noc: {
          bg: '#05070f',      // Deep space black/blue
          card: '#0c1020',    // Lighter dark slate
          border: '#1b254b',  // Subtle deep blue border
          text: '#f8fafc',    // Bright slate text
          muted: '#94a3b8',   // Muted slate text
          primary: '#38bdf8', // Neon Cyan
          success: '#10b981', // Neon Green
          warning: '#f59e0b', // Amber/Yellow
          danger: '#f43f5e',  // Neon Rose
          purple: '#a855f7'   // Deep Purple
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Orbitron', 'sans-serif']
      },
      boxShadow: {
        'glow-cyan': '0 0 15px rgba(56, 189, 248, 0.4)',
        'glow-green': '0 0 15px rgba(16, 185, 129, 0.4)',
        'glow-danger': '0 0 15px rgba(244, 63, 94, 0.4)',
        'glow-warning': '0 0 15px rgba(245, 158, 11, 0.4)',
        'glow-purple': '0 0 15px rgba(168, 85, 247, 0.4)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(56, 189, 248, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(56, 189, 248, 0.6)' }
        }
      }
    },
  },
  plugins: [],
}
