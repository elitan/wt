import * as p from "@clack/prompts";
import type { Worktree } from "./git";

function fuzzyMatch(query: string, text: string): { match: boolean; score: number } {
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

export async function picker(options: PickerOptions): Promise<PickerResult> {
  const { repoName, worktrees, initialQuery = "" } = options;

  p.intro(`wt › ${repoName}`);

  if (initialQuery) {
    const matches = worktrees
      .map((wt) => ({ wt, ...fuzzyMatch(initialQuery, wt.name) }))
      .filter((x) => x.match)
      .sort((a, b) => b.score - a.score);

    if (matches.length === 1) {
      p.outro(`→ ${matches[0].wt.name}`);
      return { type: "select", value: matches[0].wt.path };
    }

    if (matches.length > 1) {
      const selected = await p.select({
        message: `Found ${matches.length} matches for "${initialQuery}"`,
        options: [
          ...matches.map((m) => ({
            value: m.wt.path,
            label: m.wt.name,
            hint: formatAge(m.wt.createdAt),
          })),
          { value: "__create__", label: `+ Create "${initialQuery}"` },
        ],
      });

      if (p.isCancel(selected)) {
        p.cancel("Cancelled");
        return { type: "cancel" };
      }

      if (selected === "__create__") {
        return { type: "create", value: initialQuery };
      }

      return { type: "select", value: selected as string };
    }

    const shouldCreate = await p.confirm({
      message: `No matches. Create "${initialQuery}"?`,
    });

    if (p.isCancel(shouldCreate) || !shouldCreate) {
      p.cancel("Cancelled");
      return { type: "cancel" };
    }

    return { type: "create", value: initialQuery };
  }

  if (worktrees.length === 0) {
    const name = await p.text({
      message: "Create your first worktree",
      placeholder: "feature-name",
      validate: (v) => (v.length === 0 ? "Name required" : undefined),
    });

    if (p.isCancel(name)) {
      p.cancel("Cancelled");
      return { type: "cancel" };
    }

    return { type: "create", value: name as string };
  }

  const selected = await p.select({
    message: "Select worktree",
    options: [
      ...worktrees.map((wt) => ({
        value: wt.path,
        label: wt.name,
        hint: formatAge(wt.createdAt),
      })),
      { value: "__create__", label: "+ Create new worktree" },
    ],
  });

  if (p.isCancel(selected)) {
    p.cancel("Cancelled");
    return { type: "cancel" };
  }

  if (selected === "__create__") {
    const name = await p.text({
      message: "Worktree name",
      placeholder: "feature-name",
      validate: (v) => (v.length === 0 ? "Name required" : undefined),
    });

    if (p.isCancel(name)) {
      p.cancel("Cancelled");
      return { type: "cancel" };
    }

    return { type: "create", value: name as string };
  }

  return { type: "select", value: selected as string };
}

export async function confirm(message: string): Promise<boolean> {
  const result = await p.confirm({ message });
  if (p.isCancel(result)) return false;
  return result;
}
