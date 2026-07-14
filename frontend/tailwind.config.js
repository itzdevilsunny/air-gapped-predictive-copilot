/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    'bg-noc-success/8',  'border-noc-success/30',
    'bg-noc-warning/8',  'border-noc-warning/30',
    'bg-noc-danger/8',   'border-noc-danger/40',
    'bg-noc-purple/8',   'border-noc-purple/40',
    'text-noc-success',  'text-noc-warning',
    'text-noc-danger',   'text-noc-purple',
    'animate-mission-entry',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        noc: {
          bg: '#05070f',
          card: '#0c1020',
          border: '#1b254b',
          text: '#f8fafc',
          muted: '#94a3b8',
          primary: '#38bdf8',
          success: '#10b981',
          warning: '#f59e0b',
          danger: '#f43f5e',
          purple: '#a855f7'
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Orbitron', 'sans-serif']
      },
      boxShadow: {
        'glow-cyan':    '0 0 15px rgba(56, 189, 248, 0.4)',
        'glow-green':   '0 0 15px rgba(16, 185, 129, 0.4)',
        'glow-danger':  '0 0 15px rgba(244, 63, 94, 0.4)',
        'glow-warning': '0 0 15px rgba(245, 158, 11, 0.4)',
        'glow-purple':  '0 0 15px rgba(168, 85, 247, 0.4)',
      },
      animation: {
        'pulse-slow':      'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow':            'glow 2s ease-in-out infinite alternate',
        'mission-entry':   'missionEntry 0.4s ease-out both',
      },
      keyframes: {
        glow: {
          '0%':   { boxShadow: '0 0 5px rgba(56, 189, 248, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(56, 189, 248, 0.6)' }
        },
        missionEntry: {
          '0%':   { opacity: '0', transform: 'translateY(-6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      }
    },
  },
  plugins: [],
}
