import { validateTestDatabaseTarget } from "./tests/helpers/test-database-target.js";
import { defineConfig } from "vitest/config";

const testUrl = validateTestDatabaseTarget(process.env.TEST_DATABASE_URL);

export default defineConfig({
  test: {
    // Injected before test files import modules, so src/db/pool.ts connects
    // to the test database naturally (env.ts skips dotenv override under VITEST).
    include: ["tests/*.test.ts"],
    env: { DATABASE_URL: testUrl.toString(), JWT_ACCESS_SECRET: "integration-access-secret", JWT_REFRESH_SECRET: "integration-refresh-secret" },
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    pool: "forks",
  },
});