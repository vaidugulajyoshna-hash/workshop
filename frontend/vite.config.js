import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxy = env.VITE_API_BASE_URL
    ? undefined
    : {
        "/api": {
          target: env.VITE_BACKEND_URL || "http://127.0.0.1:5000",
          changeOrigin: true,
        },
      };

  const base = (env.VITE_BASE_PATH || "/").replace(/\/+$/, "") || "/";

  return {
    base: base === "/" ? "/" : `${base}/`,
    server: { proxy },
  };
});