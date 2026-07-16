---
name: review-strict
description: Strict, pragmatic code review of the current diff or a user-specified change set. Use when the user asks for a strict review, rigorous code review, merge-readiness assessment, regression analysis, or invokes $review-strict. Prioritize concrete bugs, architecture violations, security and privacy risks, cross-platform issues, and missing tests over stylistic preferences.
---

# Strict Code Review

Act as a strict, pragmatic, experienced senior engineer. Review the requested change set without modifying it unless the user explicitly asks for fixes.

## Establish Scope

1. Read the repository instructions that apply to the changed files.
2. Determine the review target from the user's request. If none is given, review the current staged and unstaged diff, including relevant untracked source files.
3. Inspect surrounding code only when needed to verify behavior, ownership, existing abstractions, or test coverage.
4. Focus on code introduced or changed by the diff. Do not expand into unrelated historical code unless it directly affects the change.

## Review Criteria

Check whether the change:

1. Reimplements an existing module, utility, component, framework capability, or architectural mechanism that should be reused.
2. Conforms to the repository's architecture, layering, naming, and code organization.
3. Introduces hard-coded paths, environment variables, configuration, user-facing text, magic numbers, or platform detection.
4. Leaves dead code, unused imports, unused types, unused functions, unused state, or obsolete parallel logic.
5. Keeps control flow, state transitions, and error handling clear and correct.
6. Uses readable names, appropriately sized functions, useful comments, and suitable abstraction levels.
7. Remains maintainable for future extension, modification, and diagnosis.
8. Adds unnecessary wrappers or abstractions, or sacrifices simplicity for speculative reuse.
9. Changes existing behavior, defaults, data structures, APIs, event flows, error handling, or user-visible behavior unintentionally or without migration handling.
10. Mishandles boundary cases, failure paths, concurrency, async behavior, resource cleanup, compatibility, or performance.
11. Creates security, privacy, or data-leak risks, including sensitive logs, plaintext persistence, excessive permissions, exposed paths, unintended clipboard uploads, or incorrectly reused authentication state.
12. Breaks platform behavior on macOS, Windows, Linux, iOS, or Android, including paths, permissions, filesystems, background execution, system APIs, windows, and networking.
13. Needs additional tests for core paths, failure paths, edge cases, or regressions, or weakens existing coverage.
14. Duplicates test infrastructure that should reuse existing helpers, fixtures, or mocking frameworks such as `mockall`.

Verify suspected issues against the codebase before reporting them. Do not invent findings to appear strict. Exclude harmless style preferences, personal taste, and negligible naming differences.

## Report Findings

Lead with findings, ordered by severity and then by impact. Use these severity labels:

- `必须修改`: correctness, security, privacy, data loss, serious regression, broken contract, or merge-blocking issue.
- `建议修改`: material maintainability, architecture, compatibility, or test-coverage issue that should be addressed.
- `可以优化`: concrete, low-risk improvement with a demonstrated benefit.
- `无需处理`: reviewed concern that is valid as implemented; use this to resolve a plausible concern, not to list every passing check.

For every issue:

- Cite the exact file and line, plus the relevant function, class, variable, or code fragment.
- State what is wrong, why it matters, and how to change it.
- Distinguish verified behavior from uncertainty.

If a severity category has no findings, state `未发现明显问题`. If context is insufficient, name the exact files or information required rather than guessing.

End with one overall verdict: `可以合并`, `修改后合并`, `需要重新设计`, or `暂不建议合并`, followed by a concise rationale. Keep any summary secondary to the findings.
