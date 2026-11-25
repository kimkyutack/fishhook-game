import { defineConfig, type ProxyOptions } from "vite";
import type { ClientRequest, IncomingMessage } from "node:http";
import react from "@vitejs/plugin-react";
const backend: ProxyOptions = {
  target: "http://127.0.0.1:8787",
  changeOrigin: true,
  ws: true,
  configure(proxy) {
    // Only translate the known local frontend origin; preserve foreign origins so the Worker rejects them.
    const translate = (out: ClientRequest, req: IncomingMessage) => {
      if (
        ["http://127.0.0.1:5173", "http://localhost:5173"].includes(
          req.headers.origin ?? "",
        )
      )
        out.setHeader("Origin", "http://127.0.0.1:8787");
    };
    proxy.on("proxyReq", translate);
    proxy.on("proxyReqWs", translate);
  },
};
export default defineConfig({
  plugins: [react()],
  server: {
    strictPort: true,
    proxy: {
      "/api": backend,
      "/ws": backend,
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) =>
          id.includes("/phaser/") ? "phaser" : undefined,
      },
    },
  },
});
