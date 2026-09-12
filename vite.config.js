import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const FLASK = `http://127.0.0.1:${process.env.PORT || 47321}`;
const ADMIN = `/${process.env.ADMIN_PATH || "admin_mode"}`;

const proxy = Object.fromEntries(
  ["/api", "/uploads", "/sms", ADMIN].map((p) => [p, { target: FLASK, changeOrigin: true }]),
);

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  build: {
    // Not "assets" -- that would collide with the art Vite copies from public/assets.
    assetsDir: "build",
  },
});
