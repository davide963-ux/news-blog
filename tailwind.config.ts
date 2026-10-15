import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: { paper: v('paper'), card: v('card'), ink: v('ink'), muted: v('muted'), line: v('line'), accent: v('accent'), 'accent-ink': v('accent-ink'), wash: v('wash') },
      fontFamily: {
        serif: ['"Source Serif 4 Variable"', 'Georgia', 'Cambria', 'Times New Roman', 'serif'],
        sans: ['"Inter Variable"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      maxWidth: { page: '1240px', read: '42rem' },
      typography: {
        DEFAULT: {
          css: {
            '--tw-prose-body': 'rgb(var(--ink) / 0.92)',
            '--tw-prose-headings': 'rgb(var(--ink))',
            '--tw-prose-links': 'rgb(var(--accent))',
            '--tw-prose-bold': 'rgb(var(--ink))',
            '--tw-prose-quotes': 'rgb(var(--ink))',
            '--tw-prose-quote-borders': 'rgb(var(--accent))',
            '--tw-prose-bullets': 'rgb(var(--muted))',
            '--tw-prose-hr': 'rgb(var(--line))',
            fontFamily: '"Source Serif 4 Variable", Georgia, serif',
            fontSize: '1.1875rem',
            lineHeight: '1.75',
            p: { marginTop: '1.15em', marginBottom: '1.15em' },
            h2: { fontFamily: '"Source Serif 4 Variable", Georgia, serif', fontWeight: '700', fontSize: '1.5rem', marginTop: '1.9em' },
            a: { textDecoration: 'underline', textUnderlineOffset: '3px', textDecorationThickness: '1px' },
          },
        },
      },
    },
  },
  plugins: [typography],
} satisfies Config;
