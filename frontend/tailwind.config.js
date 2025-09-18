/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'tyler-blue': '#1e40af',
        'tyler-green': '#059669',
        'tyler-red': '#dc2626',
      }
    },
  },
  plugins: [],
}