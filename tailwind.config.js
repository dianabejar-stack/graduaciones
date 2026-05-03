/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Azul marino — color principal de la marca ──
        navy: {
          50:  '#eff4fb',
          100: '#d9e6f4',
          200: '#b3cde9',
          300: '#7aabd6',
          400: '#4a85be',
          500: '#2d6aa6',
          600: '#1e5288',
          700: '#1e3a5f',  // #1e3a5f — primario
          800: '#152c47',
          900: '#0d1e30',
        },
        // ── Dorado — acento graduación ──
        gold: {
          50:  '#fffbeb',
          100: '#fdf6d8',
          200: '#fbecb0',
          300: '#f7de7f',
          400: '#f4d055',
          500: '#f0c040',  // #f0c040 — secundario
          600: '#d9a800',
          700: '#b88c00',
          800: '#8f6c00',
        },
        // ── Semánticos — UX del sistema ──
        brand: {
          bg:      '#f8f9fa',  // fondo general
          text:    '#1a1a2e',  // texto principal
          success: '#28a745',  // éxito
          warning: '#ffc107',  // alerta
          error:   '#dc3545',  // error
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        gold:   '0 4px 14px 0 rgba(240,192,64,0.25)',
        card:   '0 1px 3px 0 rgba(30,58,95,0.08), 0 1px 2px -1px rgba(30,58,95,0.05)',
        'card-md': '0 4px 12px 0 rgba(30,58,95,0.1), 0 2px 4px -2px rgba(30,58,95,0.06)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
}
