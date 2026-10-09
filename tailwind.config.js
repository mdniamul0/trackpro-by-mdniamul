module.exports = {
  content: ["./tabs/**/*.tsx", "./lib/**/*.tsx"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          200: "#b8cfff",
          300: "#8fb0ff",
          400: "#5f8bfa",
          500: "#3b6fed",
          600: "#2f5bd1",
          700: "#2748a8",
          900: "#111827"
        },
        glass: {
          light: "rgba(255,255,255,0.55)",
          lighter: "rgba(255,255,255,0.75)",
          border: "rgba(255,255,255,0.6)"
        }
      },
      backdropBlur: {
        xs: "2px"
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(31, 41, 55, 0.10)",
        "glass-lg": "0 20px 60px -10px rgba(31, 41, 55, 0.25)"
      },
      borderRadius: {
        "2.5xl": "1.375rem"
      }
    }
  },
  plugins: []
}
