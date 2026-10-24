#!/usr/bin/env node
import { runPlayerWorker } from "./runtime.js";
void runPlayerWorker().catch(() => {
  console.error("Player worker failed to start; check configuration and database availability");
  process.exitCode = 1;
});
