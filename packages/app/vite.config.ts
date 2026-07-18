import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    // @gubble/core is a workspace sibling that rebuilds constantly;
    // Vite's prebundle cache only invalidates on lockfile changes, so
    // without this exclusion the app quietly runs YESTERDAY'S core —
    // which cost a real debugging hour when a freshly-fixed decoder
    // failed in the browser while passing in Node. The instrument and
    // its material must never be different ages.
    exclude: ["@gubble/core"],
  },
});
