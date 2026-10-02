# Tester feedback report

Writes `out/<date>.md` from the three views in the `tester_feedback` schema
([tester-feedback.md, section 3.3](../../docs/tester-feedback.md)): every task in the pool with its category, text, and
votes, then the quest comments and app reviews. `out/` is git-ignored, since it holds testers' words.

Run it from the repository root with the database connection string in `SUPABASE_DB_URL`:

```sh
# The local stack
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run feedback:report
```

For the online project, take the connection string from the Supabase dashboard (Connect, then Session pooler). The
script only reads.

`report.ts` builds the Markdown and carries the tests; `main.ts` reads the views with
[postgres](https://github.com/porsager/postgres) and runs under vite-node, which ships with vitest. The folder is an npm
workspace so `npm run check` runs its tests; removing the feature removes the folder, its entry in the root
`workspaces`, and the `feedback:report` script.
