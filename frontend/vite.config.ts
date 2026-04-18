import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Firefox aggressively reuses keep-alive sockets. When the upstream (uvicorn)
// closes its side with `Connection: close`, http-proxy's default agent races
// and returns 502s to subsequent requests. `changeOrigin` + a short-lived
// per-request agent keeps each browser request on a fresh upstream socket.
const apiProxy = {
  target: "http://api:8000",
  changeOrigin: true,
  agent: false as const,
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": apiProxy,
      "/auth": apiProxy,
      "/scim": apiProxy,
      "/docs": apiProxy,
      "/openapi.json": apiProxy,
    },
  },
});
