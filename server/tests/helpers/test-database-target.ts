export function validateTestDatabaseTarget(value: string | undefined): URL {
  if (!value) throw new Error("TEST_DATABASE_URL must explicitly name a disposable local leadflow_test database");
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/leadflow_test") {
    throw new Error("Tests may only reset a local leadflow_test database");
  }
  return url;
}
