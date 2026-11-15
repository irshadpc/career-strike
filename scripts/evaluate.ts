#!/usr/bin/env node
import { evaluateLearning } from '../src/learning/evaluation.js';

/**
 * Engineering evaluation harness. It checks the learning loop's invariants against synthetic
 * local data; it does not claim to measure hiring outcomes. Exit code 1 means a product promise
 * about sample sizes, candidate control or the action allowlist regressed.
 */
const report = evaluateLearning();
for (const scenario of report.scenarios) {
  console.log(`${scenario.checks.every((c) => c.passed) ? 'PASS' : 'FAIL'}  ${scenario.id} — ${scenario.title}`);
  for (const check of scenario.checks) {
    if (!check.passed) console.log(`      FAIL  ${check.id}: ${check.detail}`);
  }
}
console.log(
  `\n${report.summary.checks - report.summary.failed}/${report.summary.checks} checks passed across ${report.summary.scenarios} scenarios.`,
);
if (!report.passed) process.exitCode = 1;
