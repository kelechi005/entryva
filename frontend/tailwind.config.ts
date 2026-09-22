import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Dark Luxury Glassmorphism — see design/RESIDENT_PORTAL_DESIGN_SYSTEM.md
        bg: {
          DEFAULT: '#050505', // primary background
          secondary: '#0A0A0A',
          surface: '#111111',
        },
        glass: {
          DEFAULT: 'rgba(255,255,255,0.04)', // card background
          surface: 'rgba(255,255,255,0.06)', // glass surface
          hover: 'rgba(255,255,255,0.08)',
        },
        border: {
          DEFAULT: 'rgba(255,255,255,0.10)',
          strong: 'rgba(255,255,255,0.14)',
        },
        ink: {
          DEFAULT: '#FFFFFF', // primary text (kept name `ink` so existing call sites still work)
          50: '#FFFFFF',
          100: 'rgba(255,255,255,0.10)', // repurposed: hairline borders on dark surfaces
          400: '#B8B8B8', // secondary text
          600: '#7D7D7D', // muted text
          700: '#7D7D7D',
          900: '#5A5A5A', // disabled text
        },
        mist: {
          DEFAULT: '#050505',
          50: '#0A0A0A',
        },
        brass: {
          DEFAULT: '#5DA8FF', // primary accent (kept name `brass` for compatibility)
          50: 'rgba(93,168,255,0.15)',
          600: '#4C97F2',
          700: '#5DA8FF',
        },
        verified: {
          DEFAULT: '#22C55E',
          50: 'rgba(34,197,94,0.15)',
        },
        alert: {
          DEFAULT: '#EF4444',
          50: 'rgba(239,68,68,0.15)',
        },
        warn: {
          DEFAULT: '#F59E0B',
          50: 'rgba(245,158,11,0.15)',
        },
      },
      fontFamily: {
        display: ['var(--font-body)', 'Inter', 'SF Pro Display', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'Inter', 'SF Pro Display', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        ticket: '2rem',
        card: '24px',
        pill: '999px',
      },
      backdropBlur: {
        glass: '20px',
        dock: '30px',
      },
      boxShadow: {
        card: '0px 10px 40px rgba(0,0,0,0.4)',
        floating: '0px 20px 60px rgba(93,168,255,0.25)',
        glow: '0px 0px 30px rgba(93,168,255,0.35)',
      },
      transitionTimingFunction: {
        premium: 'cubic-bezier(0.4,0,0.2,1)',
      },
      transitionDuration: {
        premium: '250ms',
      },
    },
  },
  plugins: [],
};
export default config;
