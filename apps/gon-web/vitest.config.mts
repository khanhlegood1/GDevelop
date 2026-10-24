import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/production/**/*.test.ts", "tests/integration/**/*.test.ts"],
    restoreMocks: true,
    coverage: {
      // Coverage gate (P05-R1.12): production server code is the contract-
      // critical surface; thresholds are enforced via `npm run test:coverage`.
      provider: "v8",
      include: ["src/server/**/*.ts"],
      reportsDirectory: "coverage",
      reporter: ["text-summary", "json-summary"],
      thresholds: {
        // Anti-regression floor (P05-R1.12): measured baseline over the
        // 145-test production suite on 24/10/2026 was 64.5/54.1/69.0/67.3
        // (statements/branches/functions/lines). The gate sits ~2 points
        // below to absorb tooling jitter while blocking silent drops;
        // raise deliberately as coverage grows.
        statements: 62,
        branches: 52,
        functions: 67,
        lines: 65,
      },
    },
  },
});
