/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ============================================
        // OPAI Design System - shadcn/ui tokens
        // ============================================
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },

        // ============================================
        // GARD Brand Colors — ONLY for templates, emails, login
        // DO NOT use in app UI (use semantic tokens above)
        // ============================================
        gard: {
          blue: {
            50: '#e6f0ff',
            100: '#b3d1ff',
            200: '#80b3ff',
            300: '#4d94ff',
            400: '#1a75ff',
            500: '#0056e0',  // Azul principal GARD
            600: '#0044ad',
            700: '#00337a',
            800: '#002247',
            900: '#001014',
          },
          teal: {
            50: '#e6fffa',
            100: '#b3fff0',
            200: '#80ffe6',
            300: '#4dffdc',
            400: '#1affd2',
            500: '#00d4aa',  // Teal acento
            600: '#00a888',
            700: '#007d66',
            800: '#005244',
            900: '#002622',
          },
        },
        premium: {
          dark: '#0a0e17',
          darker: '#050810',
          light: '#1a1f2e',
        },

        // ============================================
        // OPAI · Conocimiento — design tokens (literal hex)
        // Ver: src/components/opai/conocimiento/_primitives.tsx
        // ============================================
        ink: '#0D1117',
        surface: '#0F1620',
        surface2: '#141C28',
        brand: '#0066FF',
        brand2: '#3B82F6',
        status: {
          ok: '#10B981',
          okSoft: '#34D399',
          warn: '#F59E0B',
          warnSoft: '#FBBF24',
          danger: '#EF4444',
          dangerSoft: '#F87171',
          // ============================================
          // OPAI DS v3 — semantic status (token-based)
          // ============================================
          'ok-fg':         'hsl(var(--ds-ok-fg))',
          'ok-soft':       'hsl(var(--ds-ok-soft))',
          'ok-border':     'hsl(var(--ds-ok-border))',
          'warn-fg':       'hsl(var(--ds-warn-fg))',
          'warn-soft':     'hsl(var(--ds-warn-soft))',
          'warn-border':   'hsl(var(--ds-warn-border))',
          'danger-fg':     'hsl(var(--ds-danger-fg))',
          'danger-soft':   'hsl(var(--ds-danger-soft))',
          'danger-border': 'hsl(var(--ds-danger-border))',
          info:            'hsl(var(--ds-info))',
          'info-fg':       'hsl(var(--ds-info-fg))',
          'info-soft':     'hsl(var(--ds-info-soft))',
          'info-border':   'hsl(var(--ds-info-border))',
        },

        // ============================================
        // OPAI DS v3 — semantic surface / text / border tokens
        // ============================================
        ds: {
          surface: {
            0: 'hsl(var(--ds-surface-0))',
            1: 'hsl(var(--ds-surface-1))',
            2: 'hsl(var(--ds-surface-2))',
            3: 'hsl(var(--ds-surface-3))',
            4: 'hsl(var(--ds-surface-4))',
          },
          text: {
            1: 'hsl(var(--ds-text-1))',
            2: 'hsl(var(--ds-text-2))',
            3: 'hsl(var(--ds-text-3))',
            4: 'hsl(var(--ds-text-4))',
          },
          'border-subtle':  'hsl(var(--ds-border-subtle))',
          'border-default': 'hsl(var(--ds-border-default))',
          'border-strong':  'hsl(var(--ds-border-strong))',
        },

        // ============================================
        // OPAI Refined Industrial — Categorical tints
        // Para IconTile y agrupaciones visuales NO semánticas.
        // NO confundir con status-* (ok/warn/danger/info).
        // ============================================
        tint: {
          violet:        'hsl(var(--tint-violet))',
          'violet-fg':   'hsl(var(--tint-violet-fg))',
          rose:          'hsl(var(--tint-rose))',
          'rose-fg':     'hsl(var(--tint-rose-fg))',
          amber:         'hsl(var(--tint-amber))',
          'amber-fg':    'hsl(var(--tint-amber-fg))',
          emerald:       'hsl(var(--tint-emerald))',
          'emerald-fg':  'hsl(var(--tint-emerald-fg))',
          sky:           'hsl(var(--tint-sky))',
          'sky-fg':      'hsl(var(--tint-sky-fg))',
          teal:          'hsl(var(--tint-teal))',
          'teal-fg':     'hsl(var(--tint-teal-fg))',
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        'ds-sm': 'var(--ds-radius-sm)',
        'ds-md': 'var(--ds-radius-md)',
        'ds-lg': 'var(--ds-radius-lg)',
        'ds-xl': 'var(--ds-radius-xl)',
      },
      fontFamily: {
        sans: ['"Inter Variable"', '"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Outfit Variable"', '"Outfit"', 'system-ui', 'sans-serif'],
        body: ['var(--font-dm-sans)', '"DM Sans"', 'system-ui', 'sans-serif'],
        // Geist Mono primero (cargado vía @fontsource-variable/geist-mono en globals.css)
        // — no negociable para datos: precios, stock, SKU, fechas, IDs.
        // Probamos ambas variantes de nombre (depende de versión del package)
        // y caemos en JetBrains si Geist no resolviera.
        mono: ['"Geist Mono Variable"', '"Geist Mono"', 'var(--font-jetbrains)', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'glow-brand': '0 0 0 1px rgba(0,102,255,0.25), 0 8px 30px -12px rgba(0,102,255,0.45)',
        'ring-soft': 'inset 0 0 0 1px rgba(255,255,255,0.06)',
        'ds-xs': 'var(--ds-shadow-xs)',
        'ds-sm': 'var(--ds-shadow-sm)',
        'ds-md': 'var(--ds-shadow-md)',
        'ds-lg': 'var(--ds-shadow-lg)',
        'ds-glow': 'var(--ds-shadow-glow-brand)',
      },
      backgroundImage: {
        'grain-svg': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.85' numOctaves='3' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' /%3E%3C/svg%3E\")",
      },
      animation: {
        // ── OPAI Motion System ──
        // Fast (150ms): micro-interactions — focus, color change
        // Normal (200ms): sidebar, padding transitions
        // Emphasis (300ms): modals, drawers, overlays
        // Page (300ms): page entrance
        'fade-in': 'fadeIn 0.3s ease-out forwards',
        'slide-up': 'slideUp 0.3s ease-out forwards',
        'in-page': 'fadeInUp 0.3s ease-out',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
      },
      keyframes: {
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.85' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      transitionDuration: {
        'fast': '150ms',
        'normal': '200ms',
        'emphasis': '300ms',
      },
      padding: {
        'safe': 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('@tailwindcss/forms'),
    require("tailwindcss-animate"),
  ],
};
