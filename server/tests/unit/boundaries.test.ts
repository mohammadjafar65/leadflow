import { it, expect } from "vitest";
import { validateTestDatabaseTarget } from "../helpers/test-database-target.js";
import { isAllowedOrigin } from "../../src/lib/origin-policy.js";
it("only allows explicit disposable local test databases", () => {
  for (const target of [undefined, "postgres://remote.invalid/leadflow_test", "postgres://localhost/leadflow"]) {
    expect(() => validateTestDatabaseTarget(target)).toThrow();
  }
  expect(validateTestDatabaseTarget("postgres://localhost/leadflow_test").pathname).toBe("/leadflow_test");
});
it("does not trust lookalike origins or wildcard credentials", () => {
  expect(isAllowedOrigin("https://app.example.evil.invalid", "https://app.example")).toBe(false);
  expect(isAllowedOrigin("https://evil.invalid", "*")).toBe(false);
  expect(isAllowedOrigin("https://app.example", "https://app.example")).toBe(true);
});
