import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { jesseSidecar } from "./jesse-sidecar";

export default defineConfig({
  plugins: [react(), jesseSidecar()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@propsim/types": path.resolve(__dirname, "./src/vendor/types.ts"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (
              id.includes("/react/") ||
              id.includes("/react-dom/") ||
              id.includes("/react-router") ||
              id.includes("/@radix-ui/") ||
              id.includes("/@tanstack/") ||
              id.includes("/zustand/") ||
              id.includes("/scheduler/")
            ) {
              return "vendor-react";
            }
            if (id.includes("/lucide-react/")) {
              return "vendor-icons";
            }
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Jesse backtest API proxy (must be before /api to avoid being shadowed)
      "/api/jesse": {
        target: "http://127.0.0.1:9000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/jesse/, ""),
      },
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:3000",
        ws: true,
      },
      // KuCoin REST proxy (bypasses CORS for browser requests)
      "/kucoin": {
        target: "https://api.kucoin.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/kucoin/, ""),
      },
    },
  },
});
