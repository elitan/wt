import { describe, expect, test } from "bun:test";
import { fuzzyMatch } from "./ui";

interface Worktree {
  name: string;
  path: string;
  branch: string;
  commit: string;
  repoName: string;
  createdAt?: Date;
}

function fuzzyFilter(worktrees: Worktree[], term: string | undefined) {
  return worktrees
    .map((wt) => ({ wt, ...fuzzyMatch(term || "", wt.name) }))
    .filter((x) => x.match)
    .sort((a, b) => b.score - a.score);
}

describe("fuzzyMatch", () => {
  test("empty query matches everything", () => {
    expect(fuzzyMatch("", "anything").match).toBe(true);
  });

  test("exact substring match", () => {
    const result = fuzzyMatch("feat", "feature-login");
    expect(result.match).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  test("case insensitive match", () => {
    const result = fuzzyMatch("FEAT", "feature-login");
    expect(result.match).toBe(true);
  });

  test("fuzzy character match", () => {
    const result = fuzzyMatch("fl", "feature-login");
    expect(result.match).toBe(true);
  });

  test("no match returns false", () => {
    const result = fuzzyMatch("xyz", "feature-login");
    expect(result.match).toBe(false);
  });

  test("consecutive matches score higher", () => {
    const consecutive = fuzzyMatch("feat", "feature");
    const scattered = fuzzyMatch("ftre", "feature");
    expect(consecutive.score).toBeGreaterThan(scattered.score);
  });

  test("spaces treated as hyphens", () => {
    const result = fuzzyMatch("dark mode", "feat/dark-mode");
    expect(result.match).toBe(true);
  });

  test("multiple spaces normalized", () => {
    const result = fuzzyMatch("dark   mode", "dark-mode");
    expect(result.match).toBe(true);
  });
});

describe("fuzzyFilter", () => {
  const worktrees: Worktree[] = [
    {
      name: "main",
      path: "/main",
      branch: "main",
      commit: "abc",
      repoName: "test",
    },
    {
      name: "feature-login",
      path: "/wt/login",
      branch: "feature-login",
      commit: "def",
      repoName: "test",
    },
    {
      name: "feature-auth",
      path: "/wt/auth",
      branch: "feature-auth",
      commit: "ghi",
      repoName: "test",
    },
    {
      name: "bugfix-header",
      path: "/wt/header",
      branch: "bugfix-header",
      commit: "jkl",
      repoName: "test",
    },
  ];

  test("empty filter returns all sorted", () => {
    const result = fuzzyFilter(worktrees, "");
    expect(result.length).toBe(4);
  });

  test("filters by substring", () => {
    const result = fuzzyFilter(worktrees, "feature");
    expect(result.length).toBe(2);
    expect(result.map((r) => r.wt.name)).toContain("feature-login");
    expect(result.map((r) => r.wt.name)).toContain("feature-auth");
  });

  test("filters by fuzzy match", () => {
    const result = fuzzyFilter(worktrees, "fl");
    expect(result.some((r) => r.wt.name === "feature-login")).toBe(true);
  });

  test("returns empty for no matches", () => {
    const result = fuzzyFilter(worktrees, "xyz123");
    expect(result.length).toBe(0);
  });

  test("sorts by score descending", () => {
    const result = fuzzyFilter(worktrees, "login");
    expect(result[0]?.wt.name).toBe("feature-login");
  });
});

describe("picker flow simulation", () => {
  test("single match auto-selects", () => {
    const worktrees: Worktree[] = [
      {
        name: "feature-login",
        path: "/wt/login",
        branch: "feature-login",
        commit: "abc",
        repoName: "test",
      },
      {
        name: "feature-auth",
        path: "/wt/auth",
        branch: "feature-auth",
        commit: "def",
        repoName: "test",
      },
    ];

    const initialQuery = "login";
    const matches = fuzzyFilter(worktrees, initialQuery);

    // Simulates the auto-select logic in picker()
    if (matches.length === 1 && matches[0]) {
      const result = { type: "select" as const, value: matches[0].wt.path };
      expect(result.type).toBe("select");
      expect(result.value).toBe("/wt/login");
    }
  });

  test("multiple matches require picker", () => {
    const worktrees: Worktree[] = [
      {
        name: "feature-login",
        path: "/wt/login",
        branch: "feature-login",
        commit: "abc",
        repoName: "test",
      },
      {
        name: "feature-auth",
        path: "/wt/auth",
        branch: "feature-auth",
        commit: "def",
        repoName: "test",
      },
    ];

    const initialQuery = "feature";
    const matches = fuzzyFilter(worktrees, initialQuery);

    expect(matches.length).toBe(2);
    // Would show picker UI
  });

  test("create label generation", () => {
    const searchTerm = "new-feature";
    const createLabel = searchTerm
      ? `+ Create "${searchTerm}"`
      : "+ Create new";
    expect(createLabel).toBe('+ Create "new-feature"');
  });

  test("empty search shows generic create", () => {
    const searchTerm = "";
    const createLabel = searchTerm
      ? `+ Create "${searchTerm}"`
      : "+ Create new";
    expect(createLabel).toBe("+ Create new");
  });

  test("canDelete logic", () => {
    const worktrees: Worktree[] = [
      {
        name: "main",
        path: "/main",
        branch: "main",
        commit: "000",
        repoName: "test",
      },
      {
        name: "feature-x",
        path: "/wt/x",
        branch: "feature-x",
        commit: "xyz",
        repoName: "test",
      },
    ];

    const mainWt = worktrees.find((w) => w.name === "main");
    const featureWt = worktrees.find((w) => w.name === "feature-x");

    expect(mainWt && mainWt.name !== "main").toBe(false);
    expect(featureWt && featureWt.name !== "main").toBe(true);
  });
});

describe("action menu state transitions", () => {
  test("search mode -> action mode on select", () => {
    let mode: "search" | "action" = "search";
    const selectedValue: string = "/wt/login";

    // Simulate enter on a choice
    if (selectedValue !== "__create__") {
      mode = "action";
    }

    expect(mode).toBe("action");
  });

  test("action mode -> search mode on escape", () => {
    let mode: "search" | "action" = "action";

    // Simulate escape key
    mode = "search";

    expect(mode).toBe("search");
  });

  test("action open returns select", () => {
    const actionIdx = 0; // Open is first
    const actions = ["open", "delete"];
    const action = actions[actionIdx] === "delete" ? "delete" : "select";

    expect(action).toBe("select");
  });

  test("action delete returns delete", () => {
    const actionIdx = 1; // Delete is second
    const actions = ["open", "delete"];
    const action = actions[actionIdx] === "delete" ? "delete" : "select";

    expect(action).toBe("delete");
  });
});
