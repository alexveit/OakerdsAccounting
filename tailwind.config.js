/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Use your existing CSS variables
      colors: {
        // Background colors
        'app-bg': 'var(--bg)',
        'card': 'var(--bg-card)',
        'hover': 'var(--bg-hover)',
        'active': 'var(--bg-active)',
        
        // Border colors
        'border-subtle': 'var(--border-subtle)',
        'border-medium': 'var(--border-medium)',
        'border-strong': 'var(--border-strong)',
        
        // Text colors
        'main': 'var(--text-main)',
        'muted': 'var(--text-muted)',
        'light': 'var(--text-light)',
        
        // Accent colors
        'accent': {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          light: 'var(--accent-light)',
        },
        'positive': {
          DEFAULT: 'var(--accent-positive)',
          bg: 'var(--accent-positive-bg)',
        },
        'negative': {
          DEFAULT: 'var(--accent-negative)',
          bg: 'var(--accent-negative-bg)',
        },
        'info': {
          DEFAULT: 'var(--accent-info)',
          bg: 'var(--accent-info-bg)',
        },
      },
      
      // Shadows using CSS variables
      boxShadow: {
        'sm': 'var(--shadow-sm)',
        'md': 'var(--shadow-md)',
        'lg': 'var(--shadow-lg)',
      },
      
      // Border radius using CSS variables
      borderRadius: {
        'sm': 'var(--radius-sm)',
        'md': 'var(--radius-md)',
        'lg': 'var(--radius-lg)',
        'full': 'var(--radius-full)',
      },
      
      // Transitions
      transitionDuration: {
        'fast': '150ms',
        'normal': '200ms',
      },
      
      // Font sizes matching your current setup
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1.5' }],     // 12px
        'sm': ['0.8125rem', { lineHeight: '1.5' }],   // 13px
        'base': ['0.875rem', { lineHeight: '1.5' }],  // 14px
        'md': ['0.9375rem', { lineHeight: '1.5' }],   // 15px
        'lg': ['1rem', { lineHeight: '1.5' }],        // 16px
        'xl': ['1.125rem', { lineHeight: '1.5' }],    // 18px
        '2xl': ['1.25rem', { lineHeight: '1.4' }],    // 20px
      },
    },
  },
  plugins: [],
}
