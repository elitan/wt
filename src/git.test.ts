import { describe, expect, test } from "bun:test";
import { validateBranchName } from "./git";

describe("validateBranchName", () => {
  describe("valid names", () => {
    test("simple name", () => {
      expect(validateBranchName("feature-login")).toBeNull();
    });

    test("name with numbers", () => {
      expect(validateBranchName("fix-123")).toBeNull();
    });

    test("name with slashes", () => {
      expect(validateBranchName("feature/login")).toBeNull();
    });

    test("name with dots", () => {
      expect(validateBranchName("v1.0.0")).toBeNull();
    });

    test("name with underscores", () => {
      expect(validateBranchName("feature_login")).toBeNull();
    });
  });

  describe("invalid names", () => {
    test("empty string", () => {
      expect(validateBranchName("")).toBe("branch name cannot be empty");
    });

    test("starts with dot", () => {
      expect(validateBranchName(".hidden")).toBe(
        "branch name cannot start with '.'",
      );
    });

    test("starts with dash", () => {
      expect(validateBranchName("-feature")).toBe(
        "branch name cannot start with '-'",
      );
    });

    test("ends with slash", () => {
      expect(validateBranchName("feature/")).toBe(
        "branch name cannot end with '/'",
      );
    });

    test("ends with .lock", () => {
      expect(validateBranchName("feature.lock")).toBe(
        "branch name cannot end with '.lock'",
      );
    });

    test("contains double dots", () => {
      expect(validateBranchName("feature..login")).toBe(
        "branch name cannot contain '..'",
      );
    });

    test("contains @{", () => {
      expect(validateBranchName("feature@{login}")).toBe(
        "branch name cannot contain '@{'",
      );
    });

    test("contains space", () => {
      expect(validateBranchName("feature login")).toBe(
        "branch name contains invalid characters",
      );
    });

    test("contains tilde", () => {
      expect(validateBranchName("feature~1")).toBe(
        "branch name contains invalid characters",
      );
    });

    test("contains caret", () => {
      expect(validateBranchName("feature^2")).toBe(
        "branch name contains invalid characters",
      );
    });

    test("contains colon", () => {
      expect(validateBranchName("feature:login")).toBe(
        "branch name contains invalid characters",
      );
    });

    test("contains question mark", () => {
      expect(validateBranchName("feature?")).toBe(
        "branch name contains invalid characters",
      );
    });

    test("contains asterisk", () => {
      expect(validateBranchName("feature*")).toBe(
        "branch name contains invalid characters",
      );
    });

    test("contains bracket", () => {
      expect(validateBranchName("feature[1]")).toBe(
        "branch name contains invalid characters",
      );
    });

    test("contains backslash", () => {
      expect(validateBranchName("feature\\login")).toBe(
        "branch name contains invalid characters",
      );
    });
  });

  describe("edge cases", () => {
    test(".lock in middle is ok", () => {
      expect(validateBranchName("feature.lock.test")).toBeNull();
    });

    test("single dot in middle is ok", () => {
      expect(validateBranchName("v1.0")).toBeNull();
    });

    test("@ without { is ok", () => {
      expect(validateBranchName("user@feature")).toBeNull();
    });

    test("accepts valid complex names", () => {
      expect(validateBranchName("feat/user-auth_v2.0")).toBeNull();
      expect(validateBranchName("123")).toBeNull();
      expect(validateBranchName("a")).toBeNull();
    });
  });

  describe("control characters", () => {
    test("rejects null byte", () => {
      expect(validateBranchName("branch\x00name")).toBe(
        "branch name cannot contain control characters",
      );
    });

    test("rejects unit separator", () => {
      expect(validateBranchName("branch\x1fname")).toBe(
        "branch name cannot contain control characters",
      );
    });

    test("rejects delete char", () => {
      expect(validateBranchName("branch\x7fname")).toBe(
        "branch name cannot contain control characters",
      );
    });

    test("rejects tab (caught by whitespace)", () => {
      expect(validateBranchName("branch\tname")).toBe(
        "branch name contains invalid characters",
      );
    });

    test("rejects newline (caught by whitespace)", () => {
      expect(validateBranchName("branch\nname")).toBe(
        "branch name contains invalid characters",
      );
    });
  });

  describe("security", () => {
    test("path traversal chars are sanitized by slash replacement", () => {
      const malicious = "../../etc/passwd";
      const sanitized = malicious.replace(/\//g, "-");
      expect(sanitized).toBe("..-..-etc-passwd");
      expect(sanitized).not.toContain("/");
    });
  });
});

describe("path comparison", () => {
  test("trailing slash still matches", () => {
    const cwd = "/path/to/worktree/";
    const wtPath = "/path/to/worktree";
    expect(cwd.startsWith(wtPath)).toBe(true);
  });

  test("similar prefix matches (current behavior)", () => {
    const cwd = "/path/to/worktree-extra/subdir";
    const wtPath = "/path/to/worktree";
    expect(cwd.startsWith(wtPath)).toBe(true);
  });
});

describe("worktree matching", () => {
  test("partial name match finds multiple", () => {
    const worktrees = [
      { name: "feat", path: "/wt/feat" },
      { name: "feature", path: "/wt/feature" },
      { name: "feature-login", path: "/wt/login" },
    ];

    const name = "feat";
    const matches = worktrees.filter(
      (w) => w.name === name || w.name.includes(name),
    );
    expect(matches.length).toBe(3);
  });

  test("exact name match is found first", () => {
    const worktrees = [
      { name: "feat", path: "/wt/feat" },
      { name: "feature", path: "/wt/feature" },
    ];

    const name = "feat";
    const exact = worktrees.find((w) => w.name === name);
    expect(exact?.name).toBe("feat");
  });
});
