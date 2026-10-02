import { defineConfig } from "manicjs/config";

export default defineConfig({
  mode: "frontend",

  app: {
    name: "trinity",
  },

  server: {
    port: 6070,
  },

  router: {
    viewTransitions: true,
  },
});
