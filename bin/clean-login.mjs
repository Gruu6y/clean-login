#!/usr/bin/env node
// The Clean Login command line. The logic lives in lib/agent-cli.mjs so it can
// be unit-tested without spawning a process; this file only turns the result
// into an exit code and one JSON error line on stderr.
import { CliError, runCli } from "../lib/agent-cli.mjs";

try {
  process.exitCode = await runCli(process.argv.slice(2));
} catch (error) {
  const isCli = error instanceof CliError;
  process.stderr.write(
    `${JSON.stringify({
      error: isCli ? error.code : "cli_error",
      status: isCli ? error.status : 0,
      message: String(error?.message || error),
    })}\n`,
  );
  process.exitCode = 1;
}
