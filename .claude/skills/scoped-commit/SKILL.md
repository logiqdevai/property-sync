---
name: scoped-commit
description: 'Commit only the files Claude itself changed in the current session, leaving all other uncommitted changes in the working tree untouched. Use when the user says "commit your changes", "commit only yours/mine", "commit what you did", or when the working tree has unrelated in-progress changes (from the user or other work) that must not be swept into the commit.'
---

# Scoped Commit

Commit exactly the files touched in this conversation — never more — even when
`git status` shows other unrelated modified/untracked files sitting in the tree.

## When to run this

Only run this skill — and only run `git commit` at all — when the user's current
message explicitly asks for a commit (e.g. "commit", "commit your/my changes",
"commit what you did"). Finishing an edit, a migration, or any other task is
**never** implicit permission to commit, no matter what a workflow doc or agent
prompt elsewhere lists as a numbered "next step." If a task's instructions
mention `git commit` as part of a larger sequence (e.g. a migration workflow),
treat that as documentation of what the *developer* does, not a cue to run it
yourself. When in doubt, stop and ask instead of committing.

## Steps

1. Build the list of files edited/written by Claude during this session from your
   own tool-call history (Edit/Write calls). Do not guess from the diff alone.
2. Run `git status --porcelain` and `git diff --stat` to see the **full** set of
   changes in the tree. Cross-check: anything modified that you did *not*
   personally edit this session must be excluded, no matter how related it looks.
3. Stage **only** your files by explicit path:
   `git add <file1> <file2> ...` — never `git add -A`, `git add .`, or `git add -u`.
4. Run `git status --porcelain` again to confirm the staged set matches your list
   exactly and every other file is still unstaged.
5. Commit with a message describing your change (see repo's commit-message
   conventions / CLAUDE.md if present).
6. After committing, run `git status --porcelain` once more and show the user
   that all non-yours changes remain untouched.

## Rules

- If a file you edited also has hunks you didn't author (e.g. edited by the user
  mid-session), stage the whole file only if you're confident all its changes are
  yours — otherwise flag it to the user instead of guessing with `git add -p`.
- Never use `git commit -a` (stages everything, defeats the purpose).
- If unsure whether a file belongs to you, ask rather than include it.
