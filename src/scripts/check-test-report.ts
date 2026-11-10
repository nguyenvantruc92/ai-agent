import { readFileSync } from 'node:fs';

/**
 * CI check on Vitest's JSON report: every test must have run. A skipped/todo test in CI means coverage silently
 * dropped (for example DB tests without a database, or an `it.skip` left behind). Usage: tsx check-test-report.ts <file>
 */
type Report = { numTotalTests: number; numPassedTests: number; numFailedTests: number; numPendingTests: number; numTodoTests: number; testResults: { name: string; assertionResults: { fullName: string; status: string }[] }[] };

const file = process.argv[2];
if (!file) throw new Error('usage: check-test-report <vitest-json-report>');
const report = JSON.parse(readFileSync(file, 'utf8')) as Report;
const notRun = report.testResults.flatMap((suite) => suite.assertionResults.filter((test) => test.status !== 'passed' && test.status !== 'failed').map((test) => `${suite.name.replace(process.cwd() + '/', '')} › ${test.fullName} (${test.status})`));

console.log(`tests: ${report.numPassedTests} passed, ${report.numFailedTests} failed, ${report.numPendingTests + report.numTodoTests} not run, ${report.numTotalTests} total`);
if (report.numTotalTests === 0 || notRun.length) {
  for (const line of notRun.slice(0, 50)) console.error(`  not run: ${line}`);
  if (notRun.length > 50) console.error(`  … and ${notRun.length - 50} more`);
  console.error('Every test must run in CI (set TEST_DATABASE_URL; remove .skip/.todo).');
  process.exit(1);
}
