import { defineConfig } from "vite";

export default defineConfig({
  // Load environment variables from repository root .env
  envDir: "..",
  // Allow frontend access to either VITE_* vars or shared SUPABASE_* vars
  envPrefix: ["VITE_", "SUPABASE_"],
  server: {
    host: "0.0.0.0",
    port: 5173
  }
});
