/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    borderRadius: {
      none: '0px',
      DEFAULT: '0px',
      sm: '0px',
      md: '0px',
      lg: '0px',
      xl: '0px',
      '2xl': '0px',
      full: '0px'
    },
    boxShadow: {
      none: 'none',
      DEFAULT: 'none',
      sm: 'none',
      md: 'none',
      lg: 'none',
      xl: 'none',
      '2xl': 'none'
    },
    dropShadow: {
      none: 'none'
    },
    extend: {
      colors: {
        scada: {
          bg: '#07080a',
          card: '#0c0e12',
          panel: '#090b0e',
          border: '#1e293b',
          borderLight: '#334155',
          textMuted: '#64748b',
          text: '#94a3b8',
          textBright: '#f8fafc',
          kv500: '#ef4444',
          kv220: '#22c55e',
          kv132: '#06b6d4',
          kvLow: '#eab308',
          accent: '#38bdf8'
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'Consolas', 'monospace'],
        sans: ['"IBM Plex Sans"', 'Inter', 'system-ui', 'sans-serif']
      }
    },
  },
  plugins: [],
}
