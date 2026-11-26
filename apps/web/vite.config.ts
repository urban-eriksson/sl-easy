import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    // The timetable files are published nightly beside the live app; use those.
    // TT_PROXY points at another copy (a local build of timetable/build_timetable.py).
    proxy: {
      "/tt": { target: process.env.TT_PROXY ?? "https://sl.korist.se", changeOrigin: true },
    },
  },
});
