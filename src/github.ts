import { $ } from "bun";

const GITHUB_URL_REGEX = /github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/;

export interface GithubUrl {
  type: "issue" | "pr";
  owner: string;
  repo: string;
  number: number;
}

export function parseGithubUrl(url: string): GithubUrl | null {
  const match = url.match(GITHUB_URL_REGEX);
  if (!match) return null;

  const [, owner, repo, typeStr, numStr] = match;
  if (!owner || !repo || !typeStr || !numStr) return null;

  return {
    type: typeStr === "pull" ? "pr" : "issue",
    owner,
    repo,
    number: parseInt(numStr, 10),
  };
}

export function isGithubUrl(str: string): boolean {
  return GITHUB_URL_REGEX.test(str);
}

export async function checkGhCli(): Promise<void> {
  try {
    await $`gh --version`.quiet();
  } catch {
    throw new Error(
      "gh CLI not installed. Install from https://cli.github.com",
    );
  }
}

export async function getIssueInfo(
  owner: string,
  repo: string,
  number: number,
): Promise<{ title: string; number: number }> {
  const output =
    await $`gh issue view ${number} --repo ${owner}/${repo} --json title`.json();
  return { title: output.title, number };
}

export async function getPrBranch(
  owner: string,
  repo: string,
  number: number,
): Promise<string> {
  const output =
    await $`gh pr view ${number} --repo ${owner}/${repo} --json headRefName`.json();
  return output.headRefName;
}

export function slugify(title: string): string {
  const result = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 50)
    .replace(/-$/, "");
  if (!result) {
    throw new Error("cannot create branch name from title");
  }
  return result;
}
