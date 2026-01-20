import { describe, expect, test } from "bun:test";
import { isGithubUrl, parseGithubUrl, slugify } from "./github";

describe("parseGithubUrl", () => {
  test("parses issue URL", () => {
    const result = parseGithubUrl("https://github.com/elitan/wt/issues/3");
    expect(result).toEqual({
      type: "issue",
      owner: "elitan",
      repo: "wt",
      number: 3,
    });
  });

  test("parses PR URL", () => {
    const result = parseGithubUrl("https://github.com/elitan/wt/pull/123");
    expect(result).toEqual({
      type: "pr",
      owner: "elitan",
      repo: "wt",
      number: 123,
    });
  });

  test("parses URL without https", () => {
    const result = parseGithubUrl("github.com/owner/repo/issues/1");
    expect(result).toEqual({
      type: "issue",
      owner: "owner",
      repo: "repo",
      number: 1,
    });
  });

  test("returns null for invalid URL", () => {
    expect(parseGithubUrl("https://github.com/elitan/wt")).toBeNull();
    expect(parseGithubUrl("not-a-url")).toBeNull();
    expect(parseGithubUrl("")).toBeNull();
  });

  test("handles repos with dashes and underscores", () => {
    const result = parseGithubUrl(
      "https://github.com/my-org/my_repo-name/issues/42",
    );
    expect(result).toEqual({
      type: "issue",
      owner: "my-org",
      repo: "my_repo-name",
      number: 42,
    });
  });

  describe("URL edge cases", () => {
    test("handles URL with trailing slash", () => {
      const result = parseGithubUrl("https://github.com/owner/repo/pull/123/");
      expect(result).not.toBeNull();
      expect(result?.number).toBe(123);
    });

    test("handles URL with query params", () => {
      const result = parseGithubUrl(
        "https://github.com/owner/repo/pull/123?tab=files",
      );
      expect(result).not.toBeNull();
      expect(result?.number).toBe(123);
    });

    test("handles URL with hash fragment", () => {
      const result = parseGithubUrl(
        "https://github.com/owner/repo/issues/456#issuecomment-123",
      );
      expect(result).not.toBeNull();
      expect(result?.number).toBe(456);
    });

    test("handles www subdomain", () => {
      const result = parseGithubUrl("https://www.github.com/owner/repo/pull/1");
      expect(result).not.toBeNull();
    });

    test("rejects non-numeric issue numbers", () => {
      const result = parseGithubUrl("https://github.com/owner/repo/pull/abc");
      expect(result).toBeNull();
    });

    test("handles very large PR numbers", () => {
      const result = parseGithubUrl(
        "https://github.com/owner/repo/pull/999999999",
      );
      expect(result?.number).toBe(999999999);
    });

    test("correctly rejects github.com.evil.com", () => {
      const result = parseGithubUrl(
        "https://github.com.evil.com/owner/repo/pull/123",
      );
      expect(result).toBeNull();
    });
  });

  describe("domain matching", () => {
    test("xxxgithub.com is accepted (contains github.com)", () => {
      const result = parseGithubUrl(
        "https://xxxgithub.com/owner/repo/pull/123",
      );
      expect(result).not.toBeNull();
    });

    test("fakegithub.com is accepted (contains github.com)", () => {
      const result = parseGithubUrl(
        "https://fakegithub.com/owner/repo/pull/123",
      );
      expect(result).not.toBeNull();
    });
  });
});

describe("isGithubUrl", () => {
  test("returns true for issue URLs", () => {
    expect(isGithubUrl("https://github.com/elitan/wt/issues/3")).toBe(true);
  });

  test("returns true for PR URLs", () => {
    expect(isGithubUrl("https://github.com/elitan/wt/pull/123")).toBe(true);
  });

  test("returns false for non-issue/PR URLs", () => {
    expect(isGithubUrl("https://github.com/elitan/wt")).toBe(false);
    expect(
      isGithubUrl("https://github.com/elitan/wt/blob/main/README.md"),
    ).toBe(false);
  });

  test("returns false for non-github URLs", () => {
    expect(isGithubUrl("https://gitlab.com/user/repo/issues/1")).toBe(false);
    expect(isGithubUrl("not-a-url")).toBe(false);
  });
});

describe("slugify", () => {
  describe("basic transformations", () => {
    test("converts to lowercase", () => {
      expect(slugify("Hello World")).toBe("hello-world");
    });

    test("replaces spaces with dashes", () => {
      expect(slugify("add dark mode")).toBe("add-dark-mode");
    });

    test("removes special characters", () => {
      expect(slugify("feat: add login!")).toBe("feat-add-login");
    });

    test("handles multiple consecutive special chars", () => {
      expect(slugify("fix: bug -- issue")).toBe("fix-bug-issue");
    });
  });

  describe("edge cases", () => {
    test("throws on empty string", () => {
      expect(() => slugify("")).toThrow("cannot create branch name from title");
    });

    test("throws on only special characters", () => {
      expect(() => slugify("!!!@@@###")).toThrow();
    });

    test("throws on string that becomes empty after slicing", () => {
      const fiftyDashes = "-".repeat(60);
      expect(() => slugify(fiftyDashes)).toThrow();
    });

    test("handles leading/trailing special chars", () => {
      expect(slugify("---hello---")).toBe("hello");
    });

    test("handles unicode characters", () => {
      expect(slugify("café mañana")).toBe("caf-ma-ana");
    });

    test("handles emojis", () => {
      expect(slugify("🎉 party time")).toBe("party-time");
    });

    test("handles numbers", () => {
      expect(slugify("version 2.0")).toBe("version-2-0");
    });

    test("handles mixed unicode and ascii", () => {
      const result = slugify("héllo wörld 123");
      expect(result).toMatch(/^[a-z0-9-]+$/);
    });

    test("handles CJK characters", () => {
      const result = slugify("hello 世界 test");
      expect(result).toBe("hello-test");
    });

    test("handles RTL characters", () => {
      const result = slugify("hello مرحبا test");
      expect(result).toBe("hello-test");
    });
  });

  describe("length limits", () => {
    test("truncates to 50 chars", () => {
      const long =
        "this is a very long title that should be truncated to fifty chars";
      expect(slugify(long).length).toBeLessThanOrEqual(50);
    });

    test("doesn't end with dash after truncation", () => {
      const result = slugify(
        "this-is-exactly-fifty-characters-long-title-here-x",
      );
      expect(result.endsWith("-")).toBe(false);
    });

    test("exactly 50 chars ending with valid char", () => {
      const input = "a".repeat(50);
      const result = slugify(input);
      expect(result.length).toBe(50);
      expect(result).toBe("a".repeat(50));
    });

    test("51 chars truncates to 50", () => {
      const input = "a".repeat(51);
      const result = slugify(input);
      expect(result.length).toBe(50);
    });

    test("truncation removes trailing dash", () => {
      const input = `${"a".repeat(49)}-b`;
      const result = slugify(input);
      expect(result.endsWith("-")).toBe(false);
    });
  });

  describe("git branch name validity", () => {
    test("no consecutive dashes", () => {
      const result = slugify("hello   world");
      expect(result).not.toContain("--");
    });

    test("doesn't start with dash", () => {
      const result = slugify("-hello");
      expect(result.startsWith("-")).toBe(false);
    });

    test("doesn't end with dash", () => {
      const result = slugify("hello-");
      expect(result.endsWith("-")).toBe(false);
    });

    test("only contains valid git branch chars", () => {
      const result = slugify("feat[WIP]: add @mentions & notifications!");
      expect(result).toMatch(/^[a-z0-9-]*$/);
    });
  });

  describe("real-world issue titles", () => {
    test("typical feature request", () => {
      expect(slugify("Add dark mode support")).toBe("add-dark-mode-support");
    });

    test("bug report format", () => {
      expect(slugify("[BUG] Login fails on Safari")).toBe(
        "bug-login-fails-on-safari",
      );
    });

    test("conventional commit style", () => {
      expect(slugify("feat(auth): implement OAuth2")).toBe(
        "feat-auth-implement-oauth2",
      );
    });

    test("issue with quotes", () => {
      expect(slugify('Error: "undefined" is not a function')).toBe(
        "error-undefined-is-not-a-function",
      );
    });

    test("issue with backticks", () => {
      expect(slugify("Fix `npm install` error")).toBe("fix-npm-install-error");
    });

    test("issue with slashes", () => {
      expect(slugify("Fix path/to/file handling")).toBe(
        "fix-path-to-file-handling",
      );
    });
  });
});
