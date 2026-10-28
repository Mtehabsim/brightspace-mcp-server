import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * `auth --help`, run as a real process. Before it existed, an unrecognized
 * flag fell through to a live sign-in, so the one command someone types to
 * find out what the flags are started the thing they were asking about. It
 * must print the flags and exit without touching the network or writing a
 * session. CI builds before testing; locally, run `npm run build` first.
 */

const indexJs = path.resolve(__dirname, "..", "..", "build", "index.js");

function run(...args: string[]) {
  const home = mkdtempSync(path.join(os.tmpdir(), "auth-cli-help-"));
  try {
    const result = spawnSync(process.execPath, [indexJs, "auth", ...args], {
      input: "",
      encoding: "utf-8",
      env: { ...process.env, HOME: home, USERPROFILE: home, D2L_NO_UPDATE_CHECK: "1", VITEST: "" },
      timeout: 20_000,
    });
    return { ...result, homeEntries: readdirSync(home) };
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

describe.skipIf(!existsSync(indexJs))("auth --help", () => {
  it.each([["--help"], ["-h"]])("prints the usage for %j and succeeds", (flag) => {
    const result = run(flag);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("Usage: brightspace-auth");
  });

  it("documents every flag it accepts", () => {
    const { stderr } = run("--help");
    for (const flag of ["--browser", "--headed", "--automatic", "--logout", "--help"]) {
      expect(stderr).toContain(flag);
    }
    expect(stderr).toContain("D2L_HEADLESS=false");
  });

  it("starts no sign-in and writes nothing", () => {
    const result = run("--help");
    expect(result.stderr).not.toContain("Brightspace Authentication v");
    expect(result.stderr).not.toContain("Authentication failed");
    expect(result.homeEntries).toEqual([]);
  });
});
