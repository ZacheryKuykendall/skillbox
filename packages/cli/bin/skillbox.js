#!/usr/bin/env node
/**
 * Skillbox CLI entry point.
 *
 * A thin launcher so the shebang lives in a hand-written file rather than in
 * compiler output. All logic is in ../dist/.
 */
import { run } from '../dist/run.js';

process.exitCode = await run(process.argv);
