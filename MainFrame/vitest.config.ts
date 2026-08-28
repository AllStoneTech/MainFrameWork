// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Vitest config for MainFrameWork's pure-logic unit tests. Deliberately
 * separate from vite.config.ts, which carries Tauri-dev-server-only
 * settings (fixed port, HMR host, watch ignores) that have no bearing on
 * running tests.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
