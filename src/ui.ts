import * as fs from "node:fs";
import {
  createPrompt,
  isBackspaceKey,
  isDownKey,
  isEnterKey,
  isUpKey,
  makeTheme,
  type Status,
  useKeypress,
  useMemo,
  usePrefix,
  useState,
} from "@inquirer/core";
import { input, confirm as inquirerConfirm } from "@inquirer/prompts";
import type { Worktree } from "./git";

interface Choice {
  name: string;
  value: string;
  description?: string;
  canDelete?: boolean;
}

interface PickerPromptResult {
  action: "select" | "delete" | "create";
  value: string;
}

interface PickerPromptConfig {
  message: string;
  source: (term: string) => Choice[];
}

const CYAN = "\x1b[36m";
const DIM = "\x1b[90m";
const RESET = "\x1b[0m";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR_LINE = "\x1b[2K\r";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface Spinner {
  update: (msg: string) => void;
  stop: (msg?: string) => void;
}

export function spinner(message: string): Spinner {
  let frame = 0;
  let currentMsg = message;
  process.stderr.write(HIDE_CURSOR);

  const interval = setInterval(() => {
    process.stderr.write(
      `${CLEAR_LINE}${CYAN}${SPINNER_FRAMES[frame]}${RESET} ${currentMsg}`,
    );
    frame = (frame + 1) % SPINNER_FRAMES.length;
  }, 80);

  return {
    update(msg: string) {
      currentMsg = msg;
    },
    stop(msg?: string) {
      clearInterval(interval);
      process.stderr.write(CLEAR_LINE + SHOW_CURSOR);
      if (msg) console.error(msg);
    },
  };
}

type Key = { name?: string; ctrl?: boolean; shift?: boolean };

function isNextKey(key: Key): boolean {
  return (
    isDownKey(key as Parameters<typeof isDownKey>[0]) ||
    (key.name === "tab" && !key.shift)
  );
}

function isPrevKey(key: Key): boolean {
  return (
    isUpKey(key as Parameters<typeof isUpKey>[0]) ||
    Boolean(key.name === "tab" && key.shift)
  );
}

function wrapIndex(idx: number, delta: number, length: number): number {
  return (idx + delta + length) % length;
}

function renderChoices(
  choices: Choice[],
  active: number,
  showDesc = true,
): string[] {
  return choices.map((c, i) => {
    const isActive = i === active;
    const ptr = isActive ? `${CYAN}❯${RESET}` : " ";
    const name = isActive ? `${CYAN}${c.name}${RESET}` : c.name;
    const desc =
      showDesc && c.description ? ` ${DIM}${c.description}${RESET}` : "";
    return `${ptr} ${name}${desc}`;
  });
}

const simpleSearch = createPrompt<
  string,
  { message: string; source: (term: string) => Choice[] }
>((config, done) => {
  const theme = makeTheme({});
  const prefix = usePrefix({ status: "idle" as Status, theme });
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const choices = useMemo(() => config.source(query), [query, config.source]);

  useKeypress((key, rl) => {
    if (isEnterKey(key)) {
      const choice = choices[active];
      if (choice) done(choice.value);
    } else if (isNextKey(key)) {
      setActive(wrapIndex(active, 1, choices.length));
    } else if (isPrevKey(key)) {
      setActive(wrapIndex(active, -1, choices.length));
    } else {
      setQuery(rl.line);
      setActive(0);
    }
  });

  const lines = [
    `${prefix} ${config.message}${query}`,
    ...renderChoices(choices, active),
  ];
  return HIDE_CURSOR + lines.join("\n");
});

function isBackKey(key: Key): boolean {
  return (
    isBackspaceKey(key as Parameters<typeof isBackspaceKey>[0]) ||
    key.name === "left" ||
    key.name === "escape"
  );
}

function getActions(canDelete: boolean): Choice[] {
  const actions: Choice[] = [{ name: "Open", value: "open" }];
  if (canDelete) actions.push({ name: "Delete", value: "delete" });
  return actions;
}

const pickerPrompt = createPrompt<PickerPromptResult, PickerPromptConfig>(
  (config, done) => {
    const theme = makeTheme({});
    const prefix = usePrefix({ status: "idle" as Status, theme });
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const [mode, setMode] = useState<"search" | "action">("search");
    const [selected, setSelected] = useState<Choice | null>(null);
    const [actionIdx, setActionIdx] = useState(0);

    const choices = useMemo(() => config.source(query), [query, config.source]);
    const actions = getActions(selected?.canDelete ?? false);

    useKeypress((key, rl) => {
      if (mode === "search") {
        if (isEnterKey(key)) {
          const choice = choices[active];
          if (choice) {
            if (choice.value === "__create__") {
              done({ action: "create", value: query });
            } else {
              setSelected(choice);
              setActionIdx(0);
              setMode("action");
            }
          }
        } else if (isNextKey(key)) {
          setActive(wrapIndex(active, 1, choices.length));
        } else if (isPrevKey(key)) {
          setActive(wrapIndex(active, -1, choices.length));
        } else {
          setQuery(rl.line);
          setActive(0);
        }
      } else {
        if (isEnterKey(key)) {
          const action =
            actions[actionIdx]?.value === "delete" ? "delete" : "select";
          done({ action, value: selected!.value });
        } else if (isBackKey(key)) {
          setMode("search");
        } else if (isNextKey(key)) {
          setActionIdx(wrapIndex(actionIdx, 1, actions.length));
        } else if (isPrevKey(key)) {
          setActionIdx(wrapIndex(actionIdx, -1, actions.length));
        }
      }
    });

    let lines: string[];
    if (mode === "search") {
      lines = [
        `${prefix} ${config.message}${query}`,
        ...renderChoices(choices, active),
      ];
    } else {
      lines = [
        `${prefix} ${selected?.name}  ${DIM}(←/backspace: back)${RESET}`,
        ...renderChoices(actions, actionIdx, false),
      ];
    }

    return HIDE_CURSOR + lines.join("\n");
  },
);

let _ctx: {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
} | null = null;

function getCtx() {
  if (!_ctx) {
    const ttyInput = process.stdin.isTTY
      ? process.stdin
      : fs.createReadStream("/dev/tty");
    _ctx = { input: ttyInput, output: process.stderr };
  }
  return _ctx;
}

export function fuzzyMatch(
  query: string,
  text: string,
): { match: boolean; score: number } {
  if (!query) return { match: true, score: 0 };

  const q = query.toLowerCase().replace(/\s+/g, "-");
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
  type: "select" | "create" | "cancel" | "delete";
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
        getCtx(),
      );
      return { type: "create", value: name };
    } catch {
      return { type: "cancel" };
    }
  }

  try {
    const result = await pickerPrompt(
      {
        message: `wt › ${repoName} / `,
        source: (term) => {
          const searchTerm = term || initialQuery;
          const filtered = fuzzyFilter(worktrees, searchTerm);
          const createLabel = searchTerm
            ? `+ Create "${searchTerm}"`
            : "+ Create new";
          return [
            ...filtered.map((m) => ({
              name: m.wt.name,
              value: m.wt.path,
              description: formatAge(m.wt.createdAt),
              canDelete: m.wt.name !== "main",
            })),
            { name: createLabel, value: "__create__" },
          ];
        },
      },
      getCtx(),
    );

    if (result.action === "create") {
      if (!result.value) {
        const name = await input(
          {
            message: "Worktree name",
            validate: (v) => (v.length === 0 ? "Name required" : true),
          },
          getCtx(),
        );
        return { type: "create", value: name };
      }
      return { type: "create", value: result.value };
    }

    if (result.action === "delete") {
      return { type: "delete", value: result.value };
    }

    return { type: "select", value: result.value };
  } catch {
    return { type: "cancel" };
  }
}

export async function confirm(message: string): Promise<boolean> {
  try {
    return await inquirerConfirm({ message }, getCtx());
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
    const selected = await simpleSearch(
      {
        message: `wt rm › ${repoName} / `,
        source: (term) => {
          const searchTerm = term || initialQuery;
          const filtered = fuzzyFilter(deletable, searchTerm);
          return filtered.map((m) => ({
            name: m.wt.name,
            value: m.wt.path,
            description: formatAge(m.wt.createdAt),
          }));
        },
      },
      getCtx(),
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
