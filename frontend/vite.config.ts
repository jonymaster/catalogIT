import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Firefox aggressively reuses keep-alive sockets. When uvicorn replies with
// `Connection: close`, http-proxy's default agent races the socket teardown
// and returns 502 on the next request. Disable the proxy agent (no pooling)
// and force `Connection: close` on the outbound request so uvicorn closes the
// upstream cleanly each time.
//
// The `configure` hook also logs proxy errors so dev issues show up clearly
// in `docker compose logs ui`.
const apiProxy = {
  target: "http://api:8000",
  changeOrigin: true,
  agent: false as const,
  // Types here intentionally use `any` because http-proxy's runtime shape
  // diverges from its published .d.ts under Vite 8 / http-proxy-3.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  configure: (proxy: any) => {
    proxy.on("proxyReq", (proxyReq: { setHeader: (k: string, v: string) => void }) => {
      proxyReq.setHeader("Connection", "close");
    });
    proxy.on(
      "error",
      (
        err: NodeJS.ErrnoException,
        req: { url?: string },
        res: { headersSent?: boolean; writeHead: (c: number, h?: Record<string, string>) => void; end: (b?: string) => void } | undefined,
      ) => {
        const url = req?.url ?? "";
        const code = err?.code ?? "ERR";
        console.error(`[vite-proxy] ${code} ${url}: ${err?.message ?? ""}`);
        if (res && !res.headersSent) {
          res.writeHead(502, { "Content-Type": "text/plain" });
          res.end(`proxy error: ${err?.message ?? code}`);
        }
      },
    );
  },
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
