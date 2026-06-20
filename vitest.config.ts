import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./client/src/__tests__/setup.ts"],
    include: [
      "client/src/__tests__/**/*.test.{ts,tsx}",
      "client/src/lib/__tests__/**/*.test.{ts,tsx}",
      "server/**/*.test.ts",
    ],
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: false,
      }
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    reporter: ["verbose"],
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
});
