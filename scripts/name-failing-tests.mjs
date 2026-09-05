/**
 * Names the tests that failed, from jest's JSON report.
 *
 * Issue #91: a test has failed twice under load and has never been identified,
 * because the run that failed it was the same run whose output was discarded.
 * Jest does print the name, but only into a log nobody keeps, and the failure
 * has not reproduced in the twenty runs since. So CI writes the report to a
 * file that survives the job, and this prints the part worth reading.
 *
 * Deliberately not a test framework of its own: it prints and exits 0, because
 * the jest step has already failed the build by the time this runs.
 */
import {readFileSync} from "node:fs";

const path = process.argv[2] ?? "jest-results.json";

let report;
try {
    report = JSON.parse(readFileSync(path, "utf8"));
} catch (error) {
    console.log(`No jest report at ${path}: ${error.message}`);
    console.log("The run failed before jest wrote one -- read the Test step's log.");
    process.exit(0);
}

const failed = (report.testResults ?? []).flatMap((suite) =>
    (suite.assertionResults ?? [])
        .filter((test) => test.status === "failed")
        .map((test) => ({file: suite.name, name: test.fullName, why: test.failureMessages}))
);

if (failed.length === 0) {
    // A suite can fail to load at all, in which case there are no assertions
    // to name and the suite's own message is the only thing that says why.
    const broken = (report.testResults ?? []).filter(
        (suite) => suite.status === "failed" && (suite.assertionResults ?? []).length === 0
    );
    if (broken.length === 0) {
        console.log("Jest reported no failing test. The build failed for another reason.");
    }
    for (const suite of broken) console.log(`Suite failed to run: ${suite.name}\n${suite.message}`);
    process.exit(0);
}

console.log(`${failed.length} test(s) failed:\n`);
for (const test of failed) {
    console.log(`  ${test.name}`);
    console.log(`    ${test.file}`);
    for (const why of test.why) console.log(`${why}\n`);
}
