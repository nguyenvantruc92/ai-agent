/**
 * Vitest global setup. DB tests are `describe.skipIf(!TEST_DATABASE_URL)` so they stay optional locally; CI sets
 * REQUIRE_DB_TESTS=1 so a missing database fails the run instead of silently skipping 130 tests.
 */
export default function requireDatabase() {
  if (process.env.REQUIRE_DB_TESTS === '1' && !process.env.TEST_DATABASE_URL) {
    throw new Error('REQUIRE_DB_TESTS=1 but TEST_DATABASE_URL is not set: the database tests would be skipped.');
  }
}
