import { defineConfig } from "deepsec/config";

export default defineConfig({
  projects: [
    { id: "mighty-strolling-llama", root: ".." },
    // <deepsec:projects-insert-above>
  ],
});
