import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

if (!process.env.PERFORMANCE_ARCHIVE_WORKER) throw new Error("Set PERFORMANCE_ARCHIVE_WORKER to the archive Worker module.");

export default {
  publicDir: false,
  resolve: { alias: { "#performance-desk-archive": resolve(process.env.PERFORMANCE_ARCHIVE_WORKER) } },
  build: {
    target: "es2022",
    outDir: ".private/hosted-build",
    lib: { entry: fileURLToPath(new URL("./hosted-entry.mjs", import.meta.url)), formats: ["es"], fileName: () => "worker.mjs" },
    minify: true,
  },
};
