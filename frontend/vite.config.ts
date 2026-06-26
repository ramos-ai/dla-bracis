import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf-8"));

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  define: {
    "import.meta.env.VITE_API_URL": JSON.stringify(
      process.env.VITE_API_URL || "http://localhost:5000/api"
    ),
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const n = id.replace(/\\/g, "/");
          // Markdown editor stack: vendor + app components that depend on it
          if (
            n.includes("node_modules/@uiw/react-md-editor") ||
            n.includes("node_modules/react-markdown") ||
            n.includes("node_modules/remark-gfm")
          ) {
            return "markdown";
          }
          if (
            n.includes("MarkdownEditor") ||
            n.includes("MarkdownViewer")
          ) {
            return "markdown";
          }
          // Heavy annotation components (detection/segmentation editors and viewer)
          if (
            n.includes("PolygonAnnotationEditor") ||
            n.includes("SegmentationAnnotationEditor") ||
            n.includes("AnnotationViewer")
          ) {
            return "annotation";
          }
        },
      },
    },
  },
});
