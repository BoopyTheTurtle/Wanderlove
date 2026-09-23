# Contributing

Every change reaches `main` through a reviewed pull request that passes CI. This page covers the workflow; the
[README](README.md) covers setup.

## Workflow

1. Pull the latest `main` and branch from it. Name the branch by type: `feature/partner-quiz`, `fix/map-zoom`,
   `chore/update-deps`, or `docs/setup-guide`.
2. Keep the branch to one task and open the pull request early, as a draft if unfinished.
3. Run `npm run check` before asking for review. CI runs the same checks and blocks the merge when one fails.
4. Get one approval. `CODEOWNERS` assigns a reviewer automatically.
5. Squash-merge, then delete the branch.

Rebase on `main` when your branch falls behind; long-lived branches collect conflicts.

## Commits

Write the subject in the imperative, under about 70 characters: `Add partner quiz screen`, not `added quiz`. Explain
the reason in the body when the diff alone leaves it unclear. Squash-merging makes the pull request title the commit on
`main`, so give the title the same care.

## Where code goes

Put logic in `packages/core` when it needs neither React nor the browser: route building, scoring, data models, and
maths. Put screens, components, styles, and anything touching `window`, `navigator`, or `localStorage` in `apps/web`.
New logic in `packages/core` comes with tests beside it, as `*.test.ts`.

## Style

Prettier formats the code and ESLint catches mistakes; the editor settings in `.editorconfig` and the recommended
VS Code extensions apply both on save. Match the surrounding code for naming and comments.

## Test data

The app runs without a backend. Two test profiles live in `packages/core/src/profiles.ts`, and everything a session
creates stays in the browser's `localStorage`. The **Reset** pill on the map clears it.
