import type { Worktree } from "./git";

const ESC = "\x1b";
const CSI = `${ESC}[`;

const cursor = {
  hide: () => process.stdout.write(`${CSI}?25l`),
  show: () => process.stdout.write(`${CSI}?25h`),
  moveTo: (row: number, col: number) => process.stdout.write(`${CSI}${row};${col}H`),
};

const screen = {
  clear: () => process.stdout.write(`${CSI}2J`),
  clearLine: () => process.stdout.write(`${CSI}2K`),
};

const style = {
  reset: `${CSI}0m`,
  bold: `${CSI}1m`,
  dim: `${CSI}2m`,
  cyan: `${CSI}36m`,
  yellow: `${CSI}33m`,
  green: `${CSI}32m`,
  magenta: `${CSI}35m`,
  inverse: `${CSI}7m`,
};

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

  if (qi === q.length) {
    return { match: true, score };
  }

  return { match: false, score: 0 };
}

function formatAge(date?: Date): string {
  if (!date) return "";
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
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
  let query = initialQuery;
  let selectedIndex = 0;

  function getFiltered(): Array<{ wt: Worktree; score: number }> {
    return worktrees
      .map((wt) => ({ wt, ...fuzzyMatch(query, wt.name) }))
      .filter((x) => x.match)
      .sort((a, b) => b.score - a.score);
  }

  function render() {
    const filtered = getFiltered();
    const showCreate = query.length > 0;
    const totalItems = filtered.length + (showCreate ? 1 : 0);

    if (selectedIndex >= totalItems) selectedIndex = Math.max(0, totalItems - 1);

    cursor.moveTo(1, 1);
    screen.clearLine();
    process.stdout.write(`${style.dim}wt${style.reset} ${style.bold}${repoName}${style.reset}\n`);
    screen.clearLine();
    process.stdout.write("\n");

    screen.clearLine();
    const placeholder = query ? "" : `${style.dim}search or create worktree...${style.reset}`;
    const input = query || placeholder;
    process.stdout.write(`${style.cyan}❯${style.reset} ${input}${query ? `${style.dim}▌${style.reset}` : ""}\n`);

    const maxRows = Math.min(10, totalItems);

    for (let i = 0; i < maxRows; i++) {
      screen.clearLine();

      if (i < filtered.length) {
        const { wt } = filtered[i];
        const isSelected = i === selectedIndex;
        const prefix = isSelected ? `${style.cyan}→${style.reset}` : " ";
        const name = isSelected ? `${style.bold}${wt.name}${style.reset}` : wt.name;
        const age = formatAge(wt.createdAt);
        const branch = `${style.dim}${wt.branch}${style.reset}`;
        const ageStr = age ? `${style.yellow}${age}${style.reset}` : "";

        process.stdout.write(`${prefix} ${name} ${branch} ${ageStr}\n`);
      } else if (showCreate && i === filtered.length) {
        const isSelected = i === selectedIndex;
        const prefix = isSelected ? `${style.cyan}→${style.reset}` : " ";
        const text = isSelected
          ? `${style.green}+ Create new: ${query}${style.reset}`
          : `${style.dim}+ Create new: ${query}${style.reset}`;
        process.stdout.write(`${prefix} ${text}\n`);
      } else {
        process.stdout.write("\n");
      }
    }

    for (let i = maxRows; i < 10; i++) {
      screen.clearLine();
      process.stdout.write("\n");
    }

    screen.clearLine();
    process.stdout.write(`\n${style.dim}↑↓ navigate · enter select · esc cancel${style.reset}`);
  }

  return new Promise((resolve) => {
    cursor.hide();
    screen.clear();
    cursor.moveTo(1, 1);
    render();

    process.stdin.setRawMode(true);
    process.stdin.resume();

    function cleanup() {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      cursor.show();
      screen.clear();
      cursor.moveTo(1, 1);
    }

    function onData(data: Buffer) {
      const key = data.toString();
      const filtered = getFiltered();
      const showCreate = query.length > 0;
      const totalItems = filtered.length + (showCreate ? 1 : 0);

      if (key === "\x03" || key === "\x1b") {
        cleanup();
        resolve({ type: "cancel" });
        return;
      }

      if (key === "\r") {
        cleanup();
        if (selectedIndex < filtered.length) {
          resolve({ type: "select", value: filtered[selectedIndex].wt.path });
        } else if (showCreate) {
          resolve({ type: "create", value: query });
        } else {
          resolve({ type: "cancel" });
        }
        return;
      }

      if (key === "\x1b[A" || key === "\x10") {
        selectedIndex = Math.max(0, selectedIndex - 1);
      } else if (key === "\x1b[B" || key === "\x0e") {
        selectedIndex = Math.min(totalItems - 1, selectedIndex + 1);
      } else if (key === "\x7f") {
        query = query.slice(0, -1);
        selectedIndex = 0;
      } else if (key.length === 1 && key >= " " && key <= "~") {
        query += key;
        selectedIndex = 0;
      }

      render();
    }

    process.stdin.on("data", onData);
  });
}

export async function confirm(message: string): Promise<boolean> {
  process.stdout.write(`${message} ${style.dim}[y/N]${style.reset} `);

  if (!process.stdin.isTTY) {
    process.stdout.write("\n");
    return false;
  }

  return new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();

    function onData(data: Buffer) {
      const key = data.toString().toLowerCase();
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.write("\n");
      resolve(key === "y");
    }

    process.stdin.on("data", onData);
  });
}
