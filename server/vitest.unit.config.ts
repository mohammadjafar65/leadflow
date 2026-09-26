import { defineConfig } from "vitest/config";
export default defineConfig({ test: {
  include: ["tests/unit/**/*.test.ts"],
  env: { NODE_ENV: "test", DATABASE_URL: "postgres://localhost/leadflow_test", JWT_ACCESS_SECRET: "unit-test-access-secret", JWT_REFRESH_SECRET: "unit-test-refresh-secret" },
} });
