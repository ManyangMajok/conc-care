import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem}",
        "**/.git/**",
        "**/data/**",
        "**/.test-data/**",
        "**/.npm-cache/**",
        "**/server/**",
        "**/scripts/**",
        "**/tests/**",
      ],
    },
    watch: {
      ignored: [
        "**/data/**",
        "**/.test-data/**",
        "**/test-results/**",
        "**/.npm-cache/**",
        "**/playwright-report/**",
      ],
    },
  },
  build: { outDir: "dist" },
});
