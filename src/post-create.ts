import { dirname, join } from "node:path";
import { $ } from "bun";
import { spinner } from "./ui";

const EXCLUDED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".cache",
  ".turbo",
  ".next",
  "out",
  "coverage",
  ".git",
]);

type PackageManager = "bun" | "pnpm" | "yarn" | "npm";

export async function postCreateSetup(
  wtPath: string,
  sourceDir: string,
): Promise<void> {
  await copyGitignoreFiles(sourceDir, wtPath);
  const pm = await detectPackageManager(wtPath);
  if (pm) {
    await runInstall(wtPath, pm);
  }
}

export async function detectPackageManager(
  dir: string,
): Promise<PackageManager | null> {
  const lockfiles: [string, PackageManager][] = [
    ["bun.lockb", "bun"],
    ["bun.lock", "bun"],
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
  ];

  for (const [lockfile, pm] of lockfiles) {
    if (await Bun.file(join(dir, lockfile)).exists()) return pm;
  }
  if (await Bun.file(join(dir, "package.json")).exists()) return "npm";
  return null;
}

async function runInstall(dir: string, pm: PackageManager): Promise<void> {
  const s = spinner(`Running ${pm} install...`);
  try {
    const proc = Bun.spawn([pm, "install"], {
      cwd: dir,
      stdout: "ignore",
      stderr: "ignore",
    });
    await proc.exited;
    if (proc.exitCode !== 0) {
      s.stop(`Warning: ${pm} install failed`);
      return;
    }
    s.stop();
  } catch {
    s.stop(`Warning: ${pm} install failed`);
  }
}

async function copyGitignoreFiles(source: string, dest: string): Promise<void> {
  const files = await getGitIgnoredFiles(source);
  let copied = 0;

  for (const relPath of files) {
    const srcFile = Bun.file(join(source, relPath));
    if (!(await srcFile.exists())) continue;

    const stat = await srcFile.stat();
    if (!stat || stat.isDirectory()) continue;

    await $`mkdir -p ${dirname(join(dest, relPath))}`.quiet();
    await Bun.write(join(dest, relPath), srcFile);
    copied++;
  }

  if (copied > 0) console.error(`Copied ${copied} gitignored files`);
}

async function getGitIgnoredFiles(dir: string): Promise<string[]> {
  try {
    const output =
      await $`git -C ${dir} ls-files --others --ignored --exclude-standard`.text();
    return output
      .trim()
      .split("\n")
      .filter(Boolean)
      .filter((f) => {
        const parts = f.split("/");
        return !parts.some((part) => EXCLUDED_DIRS.has(part));
      });
  } catch {
    return [];
  }
}
