import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { detectPackageManager } from "./post-create";

describe("detectPackageManager", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(import.meta.dir, "..", `.test-pm-${Date.now()}`);
    await Bun.$`mkdir -p ${testDir}`.quiet();
  });

  afterEach(async () => {
    await Bun.$`rm -rf ${testDir}`.quiet();
  });

  test("detects bun.lockb", async () => {
    await Bun.write(join(testDir, "bun.lockb"), "");
    expect(await detectPackageManager(testDir)).toBe("bun");
  });

  test("detects bun.lock", async () => {
    await Bun.write(join(testDir, "bun.lock"), "");
    expect(await detectPackageManager(testDir)).toBe("bun");
  });

  test("detects pnpm-lock.yaml", async () => {
    await Bun.write(join(testDir, "pnpm-lock.yaml"), "");
    expect(await detectPackageManager(testDir)).toBe("pnpm");
  });

  test("detects yarn.lock", async () => {
    await Bun.write(join(testDir, "yarn.lock"), "");
    expect(await detectPackageManager(testDir)).toBe("yarn");
  });

  test("detects package-lock.json", async () => {
    await Bun.write(join(testDir, "package-lock.json"), "{}");
    expect(await detectPackageManager(testDir)).toBe("npm");
  });

  test("falls back to npm with package.json", async () => {
    await Bun.write(join(testDir, "package.json"), "{}");
    expect(await detectPackageManager(testDir)).toBe("npm");
  });

  test("returns null when no package manager detected", async () => {
    expect(await detectPackageManager(testDir)).toBeNull();
  });

  test("bun lockfile takes priority over others", async () => {
    await Bun.write(join(testDir, "bun.lockb"), "");
    await Bun.write(join(testDir, "yarn.lock"), "");
    expect(await detectPackageManager(testDir)).toBe("bun");
  });
});
