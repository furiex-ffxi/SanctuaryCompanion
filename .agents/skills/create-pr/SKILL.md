---
name: create-pr
description: >-
  Use this skill to create high-quality Pull Requests using the GitHub CLI (gh). It provides a structured format and best practices for PR descriptions.
---

# Create PR Skill

When the user asks you to create a Pull Request (PR), follow these instructions to ensure the PR is well-structured and descriptive.

## Steps

1.  **Understand the Changes**:
    *   Run `git status` and `git diff` to understand the exact changes made in the branch.
    *   If there are uncommitted changes that should be included, commit them first.
    *   If the branch hasn't been pushed, push it using `git push -u origin <branch-name>`. Note: Use `BypassSandbox: true` for `git push` and `gh pr create`.

2.  **Validate the Changes**:
    *   Run `npm run lint`, `npm run build`, and `npm test` before creating the PR. `npm test` includes the browser smoke test.
    *   Do not create the PR if any required check fails; report the exact command and failure instead.

3.  **Formulate the PR Description**:
    *   Draft a comprehensive title following conventional commits (e.g., `fix: ...`, `feat: ...`, `refactor: ...`).
    *   Write a detailed body containing at least the following sections:
        *   **Problem**: What was the issue or motivation for the change?
        *   **Solution**: How does this change resolve the problem? Focus on technical decisions.
        *   **Impact**: What are the visible outcomes or side effects? (e.g., UI changes, performance, bug fixes).

4.  **Create the PR**:
    *   Write the formatted PR body to a temporary markdown file (e.g., `scratch/pr_body.md`) to preserve formatting and newlines.
    *   Use the GitHub CLI to create the PR:
        ```bash
        gh pr create --title "<your-title>" --body-file scratch/pr_body.md
        ```
    *   *Important*: Ensure you use `BypassSandbox: true` when running `gh pr create` as it requires network access.

5.  **Check Supporting Materials**:
    *   Ensure the PR updates relevant documentation and screenshots when the changes require them.

6.  **Confirm**:
    *   Provide the user with the link to the created PR.
