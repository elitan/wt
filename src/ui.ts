import * as fs from "node:fs";
import { input, confirm as inquirerConfirm, search } from "@inquirer/prompts";
import type { Worktree } from "./git";

const ttyInput = process.stdin.isTTY
  ? process.stdin
  : fs.createReadStream("/dev/tty");
const ctx = { input: ttyInput, output: process.stderr };

function fuzzyMatch(
  query: string,
  text: string,
): { match: boolean; score: number } {
  if (!query) return { match: true, score: 0 };

  const q = query.toLowerCase();
  const t = text.toLowerCase();

  if (t.includes(q)) {
    const pos = t.indexOf(q);
    return { match: true, score: 100 - pos + (q.length / t.length) * 50 };
  }

  let qi = 0;
  let score = 0;
  let lastMatchPos = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 10;
      if (lastMatchPos === ti - 1) score += 5;
      lastMatchPos = ti;
      qi++;
    }
  }

  if (qi === q.length) return { match: true, score };
  return { match: false, score: 0 };
}

function formatAge(date?: Date): string {
  if (!date) return "";
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

interface PickerResult {
  type: "select" | "create" | "cancel";
  value?: string;
}

interface PickerOptions {
  repoName: string;
  worktrees: Worktree[];
  initialQuery?: string;
}

function fuzzyFilter(worktrees: Worktree[], term: string | undefined) {
  return worktrees
    .map((wt) => ({ wt, ...fuzzyMatch(term || "", wt.name) }))
    .filter((x) => x.match)
    .sort((a, b) => b.score - a.score);
}

export async function picker(options: PickerOptions): Promise<PickerResult> {
  const { repoName, worktrees, initialQuery = "" } = options;

  if (initialQuery) {
    const matches = fuzzyFilter(worktrees, initialQuery);
    const first = matches[0];

    if (matches.length === 1 && first) {
      console.error(`→ ${first.wt.name}`);
      return { type: "select", value: first.wt.path };
    }
  }

  if (worktrees.length === 0) {
    try {
      const name = await input(
        {
          message: `wt › ${repoName} › Create your first worktree`,
          default: initialQuery || undefined,
          validate: (v) => (v.length === 0 ? "Name required" : true),
        },
        ctx,
      );
      return { type: "create", value: name };
    } catch {
      return { type: "cancel" };
    }
  }

  try {
    let lastTerm = initialQuery;

    const selected = await search(
      {
        message: `wt › ${repoName} / `,
        source: async (term) => {
          const searchTerm = term ?? initialQuery;
          lastTerm = searchTerm;
          const filtered = fuzzyFilter(worktrees, searchTerm);
          const createLabel = searchTerm
            ? `+ Create "${searchTerm}"`
            : "+ Create new";
          return [
            ...filtered.map((m) => ({
              name: m.wt.name,
              value: m.wt.path,
              description: formatAge(m.wt.createdAt),
            })),
            { name: createLabel, value: "__create__", description: "" },
          ];
        },
      },
      ctx,
    );

    if (selected === "__create__") {
      if (!lastTerm) {
        const name = await input(
          {
            message: "Worktree name",
            validate: (v) => (v.length === 0 ? "Name required" : true),
          },
          ctx,
        );
        return { type: "create", value: name };
      }
      return { type: "create", value: lastTerm };
    }

    return { type: "select", value: selected };
  } catch {
    return { type: "cancel" };
  }
}

export async function confirm(message: string): Promise<boolean> {
  try {
    return await inquirerConfirm({ message }, ctx);
  } catch {
    return false;
  }
}

interface DeletePickerOptions {
  repoName: string;
  worktrees: Worktree[];
  currentPath?: string;
}

export async function deletePicker(
  options: DeletePickerOptions,
): Promise<Worktree | null> {
  const { repoName, worktrees, currentPath } = options;
  const deletable = worktrees.filter((wt) => wt.name !== "main");

  if (deletable.length === 0) {
    console.error("No worktrees to delete");
    return null;
  }

  const currentWt = currentPath
    ? deletable.find((wt) => currentPath.startsWith(wt.path))
    : undefined;
  const initialQuery = currentWt?.name || "";

  try {
    const selected = await search(
      {
        message: `wt rm › ${repoName} / `,
        source: async (term) => {
          const searchTerm = term ?? initialQuery;
          const filtered = fuzzyFilter(deletable, searchTerm);
          return filtered.map((m) => ({
            name: m.wt.name,
            value: m.wt.path,
            description: formatAge(m.wt.createdAt),
          }));
        },
      },
      ctx,
    );

    const wt = deletable.find((w) => w.path === selected);
    if (!wt) return null;

    if (await confirm(`Delete ${wt.name}?`)) {
      return wt;
    }
    return null;
  } catch {
    return null;
  }
}
