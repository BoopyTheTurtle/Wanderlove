import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// One ID per build, stamped into the bundle and published at /version.json, so an open tab can tell that a newer
// build is live (src/lib/appVersion.ts).
const buildId = Date.now().toString(36);

function versionFile(): Plugin {
  return {
    name: "wannadoo-version-file",
    apply: "build",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: `${JSON.stringify({ id: buildId })}\n` });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), versionFile()],
  define: {
    "import.meta.env.VITE_BUILD_ID": JSON.stringify(buildId),
  },
  server: {
    allowedHosts: true,
  },
});
