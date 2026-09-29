---
name: parallel-build
description: Split a complex task into independent pieces and build them in parallel with feature-builder sub-agents, each on its own branch and worktree, ending in draft PRs that Edgar approves before merge. Use for any complex, multi-part task in this repo when the parts can be separated; invoked as /parallel-build <task>.
---

# Parallel build

You orchestrate; `feature-builder` agents build. Edgar approves the split before anything is spawned and approves each
merge.

## 1. Prepare

- Find the **integration branch**: the branch the current work pushes to. It is `chore/repo-structure` for the internal
  build (docs/internal-build.md, section 1), later `main`.
- Commit and push anything the agents need from the integration branch. Agents branch from `origin/<integration>`, so
  unpushed work is invisible to them.
- Make sure the local Supabase stack is running (`npx supabase status`) if any task touches the database or signs in.

## 2. Split

Break the task into pieces that can be built and reviewed independently. For each piece write:

- **Task** and what "done" means.
- **Owns:** the files it may touch. No file appears under two pieces. Shared files (`App.tsx`, `index.css`,
  `package.json`, `package-lock.json`) go to exactly one piece; pieces that need a hook there describe it in the brief,
  and the owner or a final integration piece wires it in.
- **Branch:** `feature/<slug>` or `fix/<slug>`.
- **Depends on:** another piece whose PR must merge first, if any. Dependent pieces wait for the next wave.

Rules for a good split:

- **Database work is one piece per wave**: migrations, pgTAP tests, and `database.types.ts` move together.
- **New dependencies are installed by one piece.** Two pieces editing `package-lock.json` always conflict.
- Prefer 2–4 pieces. Work too tangled to separate stays in one piece, or you build it yourself.
- If the task splits badly, say so and build it in this session instead.

**Show Edgar the split as a short table (piece, owns, branch, depends on) and wait for his go before spawning.**

## 3. Spawn

Spawn one `feature-builder` per piece in the wave, in a single message, each with `isolation: "worktree"` and
`run_in_background: true`. The prompt carries the full brief: task, owns, integration branch, branch, the main
checkout's absolute path, and any context from this conversation the agent cannot find in the repo (it starts cold).

While they run, do not edit files they own.

## 4. Review

When an agent reports back:

1. Read its PR diff (`gh pr diff <n>`) and CI status (`gh pr checks <n>`).
2. Check that it stayed inside **Owns**, that `npm run check` passed, and that the diff does what the brief asked.
3. Fix small problems by pushing to its branch yourself; send larger ones back with `SendMessage` to that agent.

## 5. Merge (only with Edgar's approval)

Summarise each PR in two or three lines with its link and ask Edgar which to merge. For each approved PR, in dependency
order:

1. Remove the agent's worktree first, or `--delete-branch` cannot delete a branch it has checked out:
   `git worktree remove --force <path>`. On Windows that often unregisters the worktree but leaves `node_modules`
   behind; delete the leftover folder with `rm -rf`.
2. `gh pr ready <n>`, then `gh pr merge <n> --squash --delete-branch`.
3. Rebase the remaining open branches on the updated integration branch and push them (`--force-with-lease`), or ask
   their agents to.
4. Pull the integration branch locally.

Then spawn the next wave, if any, and finish by updating the progress notes the project keeps (for the internal build,
the **Progress** section of `docs/internal-build.md`).
