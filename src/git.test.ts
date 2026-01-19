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
  });
});
