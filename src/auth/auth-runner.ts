/**
 * Purdue Brightspace MCP Server
 * Copyright (c) 2026 Rohan Muppa. All rights reserved.
 * Licensed under MIT — see LICENSE file for details.
 */

import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import { log } from "../utils/logger.js";

/**
 * Timeout for the auth process. Generous because the user may need to
 * approve MFA on their phone or manually log in via the browser.
 */
// Must exceed the auth flow's own budget, otherwise this timeout kills the
// child mid-login and the manual path can never finish. BrowserAuth allows
// 60s for the browser launch plus 300s to intercept the token when the user
// logs in by hand (120s when credentials drive the SSO), so the inner budget
// is up to 6 minutes. Killing Chrome partway is also what leaves the profile
// crash-flagged, per the SIGTRAP notes in browser-auth.ts.
const AUTH_TIMEOUT_MS = 6.5 * 60 * 1000; // 6.5 minutes

/**
 * Launches the brightspace-auth CLI as a child process to
 * re-authenticate when the current session has expired.
 *
 * The child process inherits the parent's environment (so .env credentials
 * are available via dotenv in the auth CLI) and runs with the project root
 * as CWD (so dotenv can find the .env file).
 */
export class AuthRunner {
  private running = false;
  private readonly scriptPath: string;
  private readonly projectRoot: string;

  constructor() {
    // Resolve paths relative to this file's compiled location (build/auth/auth-runner.js)
    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    this.scriptPath = path.resolve(thisDir, "..", "auth-cli.js");
    this.projectRoot = path.resolve(thisDir, "..", "..");
  }

  /**
   * Spawn the auth CLI and wait for it to complete.
   * Returns true if authentication succeeded, false otherwise.
   * Prevents concurrent auth attempts via a simple mutex.
   */
  async run(): Promise<boolean> {
    if (this.running) {
      log("DEBUG", "Auth already running, skipping duplicate attempt");
      return false;
    }

    this.running = true;
    try {
      log("INFO", "Auto-launching brightspace-auth...");

      return await new Promise<boolean>((resolve) => {
        execFile(
          process.execPath, // use the same Node binary
          [this.scriptPath],
          {
            timeout: AUTH_TIMEOUT_MS,
            cwd: this.projectRoot,
            env: { ...process.env },
          },
          (error, _stdout, _stderr) => {
            if (error) {
              log("ERROR", "Auto-auth process failed", error.message);
              resolve(false);
            } else {
              log("INFO", "Auto-auth completed successfully");
              resolve(true);
            }
          },
        );
      });
    } finally {
      this.running = false;
    }
  }
}
