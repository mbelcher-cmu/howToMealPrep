import { defineConfig } from "vitest/config";

// The solver runs against a wall-clock time limit, so test files share the CPU poorly:
// run them one after another to keep results the same on any machine.
export default defineConfig({ test: { fileParallelism: false, testTimeout: 30000 } });
