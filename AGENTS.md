# Working on Ignited taskboard

Read `README.md` and `SPEC.md` before changing behavior. The repository is
`ValFilms/ignited-taskboard`; Vercel deploys `main` to production at
https://ignited-taskboard.vercel.app.

## Team workflow

- The owners want to request changes in plain language. Handle Git, checks,
  previews, and release steps for them; do not ask them to create branches or
  operate GitHub manually.
- Either collaborator may prepare and publish their work. Do not introduce a
  requirement for the other person's approval. Publishing still requires the
  requesting user's explicit instruction, such as "publish" or "go live".
- Before work, inspect the working tree and fetch `origin`. Preserve uncommitted
  work. Start each unrelated change from current `origin/main` in its own
  `codex/<short-description>` branch and separate checkout/worktree when needed.
  Never share a mutable working branch between concurrent tasks.
- Check `gh api user` and the repository's Git author identity. Use the requesting
  collaborator's own identity, with repository-local configuration when needed.
  Never use the partner's identity to bypass a deployment permission problem.
- Commit small, coherent changes with useful messages. Push the working branch
  when the requested change is ready. A pull request can record the summary and
  checks, but is not a request for mandatory partner approval. Do not enable
  auto-merge while waiting for the user's publishing instruction.
- Never force-push a shared branch, discard someone else's changes, or push to
  `main` during ordinary editing. Resolve understandable conflicts while
  preserving both people's intent; ask when the intended behavior is ambiguous.

## Validation and preview

- Use Node 24 and `npm ci`. Run `npm run check` before presenting a release
  candidate. It runs the tests, TypeScript validation, and production build.
- `.github/workflows/checks.yml` runs the same checks on pushes and pull requests.
  Confirm the results correspond to the current commit, not an earlier version.
- Fetch and incorporate any newer `origin/main` changes into the working branch
  before final validation. Re-run affected checks after conflict resolutions.
- Show the user the change summary, test results, and a local demo or verified
  Vercel Preview URL for this commit. A successful build is not proof that the
  live integrations have been tested.
- Without Supabase configuration the app provides a fictional demo. Prefer this
  or a dedicated staging Supabase project for previews. A Vercel Preview may
  still share production data if its environment variables point there; verify
  this before exercising state-changing actions. Never test against real clients
  or copy production secrets into previews just to make tests pass.
- Keep credentials out of source and logs. Do not change Supabase data/schema,
  Google intake triggers, external schedulers, or team accounts as a side effect
  of routine code changes.

## Publish after the user's instruction

1. Fetch `origin` again. The release candidate must contain current `origin/main`.
   If the partner has published since the preview, incorporate those changes,
   check the combined result, and explain any material difference. If it changes
   what the user confirmed, show the updated preview before releasing it.
2. Run `npm run check` for that candidate and verify its GitHub checks. Do not
   publish with failed, missing, or still-running checks. Record the tested commit
   SHA and previous production SHA.
3. Publish the exact tested commit with a normal fast-forward push to `main`
   (for example, `git push origin <tested-sha>:refs/heads/main`). This preserves
   both contributors' history. If Git rejects it because `main` advanced, fetch,
   incorporate the new work, and repeat validation. Never force the push.
4. Wait for Vercel's Production deployment for that exact commit. Verify its
   success and check the live URL before reporting it live. If deployment fails,
   report the failure; a Git push alone is not a successful release.
5. Summarize what shipped and link the commits/deployment. For a requested rollback,
   prefer reverting the relevant change with a new commit and checking the result
   so unrelated work remains intact. Do not rewrite shared history.

These instructions coordinate agent behavior; they do not enforce repository
permissions. GitHub checks alone do not stop a direct push from deploying on
Vercel. Enforcing checks for all contributors requires repository rules configured
by an administrator; it does not require human approval rules.
