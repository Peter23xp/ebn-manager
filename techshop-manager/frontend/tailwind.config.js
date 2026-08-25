/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Sidebar (light, alignée sur le header) ──────────────
        sidebar: {
          bg:      '#ffffff',
          hover:   '#f1f5f9',
          active:  '#dbeafe',
          border:  '#e2e8f0',
          text:    '#64748b',
          textHi:  '#0f172a',
        },
        // ── Primary palette ──────────────────────────────────────
        primary: {
          DEFAULT: '#0A1628',
          accent:  '#2563eb',   // electric blue
          light:   '#dbeafe',
          muted:   '#93c5fd',
        },
        // ── Semantic ─────────────────────────────────────────────
        success: '#15803d',
        warning: '#d97706',
        danger:  '#dc2626',
        platine: '#7c3aed',
        // ── Content surface ──────────────────────────────────────
        text: {
          DEFAULT: '#0f172a',
          muted:   '#64748b',
          subtle:  '#94a3b8',
        },
        bg: {
          DEFAULT: '#f1f5f9',
          card:    '#ffffff',
          inset:   '#e2e8f0',
        },
        border: {
          DEFAULT: '#e2e8f0',
          strong:  '#cbd5e1',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'page-title':    ['24px', { fontWeight: '800', lineHeight: '1.25', letterSpacing: '-0.02em' }],
        'section-title': ['15px', { fontWeight: '700', lineHeight: '1.4',  letterSpacing: '-0.01em' }],
        body:            ['14px', { fontWeight: '400', lineHeight: '1.6' }],
        label:           ['12px', { fontWeight: '600', lineHeight: '1.4',  letterSpacing: '0.03em', textTransform: 'uppercase' }],
        code:            ['13px', { fontWeight: '400', lineHeight: '1.4',  fontFamily: '"JetBrains Mono", monospace' }],
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        lg:  '0.75rem',
        xl:  '1rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        card:        '0 1px 2px rgba(15,23,42,0.04), 0 2px 8px rgba(15,23,42,0.06)',
        'card-hover':'0 4px 16px rgba(15,23,42,0.10), 0 2px 6px rgba(15,23,42,0.06)',
        sidebar:     '4px 0 24px rgba(15,23,42,0.06)',
        glow:        '0 0 0 3px rgba(37,99,235,0.18)',
        'kpi-blue':  '0 4px 20px rgba(37,99,235,0.15)',
        'kpi-green': '0 4px 20px rgba(21,128,61,0.15)',
        'kpi-amber': '0 4px 20px rgba(217,119,6,0.15)',
        'kpi-red':   '0 4px 20px rgba(220,38,38,0.15)',
      },
      minHeight: { touch: '44px' },
      minWidth:  { touch: '44px' },
      transitionTimingFunction: {
        'out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
        'spring':    'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-in-left': {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.4' },
        },
      },
      animation: {
        'fade-up':       'fade-up 0.4s cubic-bezier(0.25, 1, 0.5, 1) both',
        'fade-in':       'fade-in 0.3s ease both',
        'slide-in-left': 'slide-in-left 0.3s cubic-bezier(0.25, 1, 0.5, 1) both',
        'pulse-dot':     'pulse-dot 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
