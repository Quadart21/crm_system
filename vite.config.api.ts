import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  build: {
    ssr: true,
    outDir: "dist/api",
    emptyOutDir: false,
    target: "node22",
    rollupOptions: {
      input: "src/api/server.ts",
      output: {
        entryFileNames: "server.js",
        format: "esm",
      },
    },
  },
});
