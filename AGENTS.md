# Numbered releases for Ignited taskboard

Read `README.md` and `SPEC.md` before changing behavior. The repository is
`ValFilms/ignited-taskboard`. Vercel deploys `main` to production at
https://ignited-taskboard.vercel.app. The version endpoint is `/api/version`.

## The owner's interaction

Handle Git, version numbers, validation, and deployment automatically. The owners
want this conversation:

- Before changing the app: **"Staging v8 now."** Say which version is still live
  only when it has been verified. Use the actual reserved number, not this example.
- When the preview is verified: **"v8 is ready to test: [preview link]. Try it,
  then say go live when you're ready."** Include the actual preview URL.
- After "go live" and a verified deployment: **"v8 is live."**
- For "revert to v7": restore the **whole saved v7 app snapshot**, validate it,
  publish it, and report **"v7 is live again"** only after verification.

"Revert to v7" is an explicit instruction to publish that saved version; do not
ask for a second "go live" instruction. It takes all newer app changes out of the
live version while retaining their commits and saved versions. Do not interpret
this request as selectively undoing the user's latest change. Either collaborator
may release; no approval from the other person is required.

## Starting and continuing work

1. Check the working tree and project account using `git github identity`.
   For this project the owners authorized the actual **ValFilms** account.
   Follow the account-isolation rules below. Preserve uncommitted work and all
   existing commit authorship.
2. Run `npm run versions -- history` to inspect saved/staged versions and the live
   endpoint. A failed endpoint lookup means live status is unknown, not v0 or v1.
3. For a new task, run `npm run versions -- stage <description>` from a clean
   checkout/worktree. It fetches current `origin/main`, reserves the next shared
   number in `staging/vN`, creates a separate branch, and commits `release.json`.
   Announce the returned staging number before editing feature code.
4. To adopt already-prepared work on a separate branch, use `stage --current`.
   Continuing the same unshipped batch retains its number. Use separate worktrees
   for concurrent tasks; never share a mutable branch. Numbers are never reused,
   including after an abandoned stage or rollback.
5. Make coherent commits and push only the working branch during staging. A pull
   request is optional history, not a mandatory partner-approval step. Never turn
   on auto-merge while waiting for the user's "go live" instruction.

Reservations prevent the two collaborators from independently claiming the same
number. Do not move/delete reservation tags or saved `vN` tags. They are the shared
release record. Do not manually invent a live version or change `release.json`
outside the release workflow.

## Validate and show staging

- Use Node 24 (`.nvmrc`), `npm ci`, and `npm run check`. GitHub Actions runs the
  same tests, TypeScript validation, and production build for pushed branches.
- Before final validation, fetch and incorporate newer `origin/main` changes.
  Retain the candidate's own `release.json` number when merging the partner's
  version marker. Resolve conflicts while preserving both people's intended work;
  ask if the intended behavior is ambiguous.
- Run `npm run versions -- candidate`. It rejects stale candidates, changes to
  saved snapshots, and an older staging number after a newer version has shipped.
  If the number is stale, use `stage --current --new`, announce the new number,
  and validate it. Do not silently renumber a preview already confirmed by the user.
- Push the staging branch to create its Vercel Preview, wait for deployment, and
  provide its deployment-specific URL so both owners can open and test the exact
  candidate. A moving branch URL alone does not identify what the owner tested.
  Verify `/api/version` reports the candidate's version and full commit SHA with
  environment `preview`. Include the version, preview URL, commit, change summary,
  and test results in the handoff. Verify the owners can access the protected
  preview; do not disable protection to work around missing access.
- Passing automated checks alone does not mean the preview is ready to test. If
  deployment, access, or test-data setup is blocked, report that blocker and do
  not request go-live confirmation until a working preview has been provided.
- Use the fictional demo or a dedicated staging Supabase project for test edits.
  A Vercel Preview can still share production data through its environment variables.
  Do not test on real clients, copy production secrets, change SQL/schema, or alter
  Google intake, schedulers, or team accounts as a side effect of code work.

## Go live

1. Require the user's "go live" / "publish" instruction after presenting the
   verified preview. That instruction confirms the exact candidate commit shown
   for testing; no approval from the other partner is required.
2. Fetch again, include the partner's latest work, and run
   `npm run versions -- candidate`. If the candidate commit differs from the
   preview the user confirmed, deploy and verify its updated preview, show it for
   testing, and wait for a new go-live instruction before release. This includes
   partner changes merged after the original preview was presented.
   Run `npm run check` and confirm successful GitHub checks for the exact SHA.
3. Fast-forward `main` to that exact tested commit with a normal push, such as
   `git push origin <tested-sha>:refs/heads/main`. If main advanced concurrently,
   fetch, combine, and validate again. Never force-push or reset shared history.
4. Wait for Vercel's successful Production deployment for that SHA. Check the
   actual live URL and run `npm run versions -- record vN`. This verifies that
   `/api/version` reports that version, commit, and production environment before
   creating the immutable saved `vN` tag. A successful Git push alone is not live.
5. Report the version now live and link its saved snapshot. If deployment or
   recording fails, say which step failed; keep the same staging number for fixes
   until it has actually been saved. Never pretend a failed release is restorable.

## Revert to a numbered version

1. On the user's instruction "revert to vN", run `npm run versions -- restore vN`
   from a clean checkout. This creates a separate branch with a new commit whose
   full file tree matches the saved version and whose parent is current main.
   Newer commits remain in history. Announce the target version before proceeding.
2. Validate that snapshot and its compatibility with the current data/schema. No
   database restoration or destructive migration is implied. Push the restore
   branch and verify its checks before advancing main.
3. If the partner changes main meanwhile, regenerate the restore candidate from
   the saved version with the new main as parent. Do not merge newer app contents
   into the restore snapshot, since that would no longer be the requested version.
4. Run `candidate`, publish the exact tested commit with a normal fast-forward,
   and wait for Vercel. Run `record vN` to verify the restored live app. The saved
   tag stays on its original snapshot; the restore commit is a new history entry.
   The next new stage uses a number above all earlier reservations/releases.

The helper intentionally never pushes to main or deploys by itself. The agent
performs those steps only for the user's go-live or numbered-revert instruction.
GitHub checks do not themselves block direct pushes from triggering Vercel;
enforcing checks for every contributor requires administrator-configured rules,
which need not require human approval. Vercel access remains separate from GitHub.

## Project account isolation — applies to Codex and Claude Code

- This repository uses the authorized **ValFilms** GitHub account. Other projects
  and Claude sessions must keep their existing accounts and settings.
- On a new clone, or after the account helper changes, run `npm run github -- setup`.
  It verifies the saved ValFilms credential against GitHub before installing a
  repository-local Git alias, credential helper, and author identity. It does not
  log in, switch accounts, or write global Git/GitHub settings. Node and `gh` are
  required. The origin must be `https://github.com/ValFilms/ignited-taskboard.git`.
- Use **`git github ...`** instead of bare `gh ...` here. For example,
  `git github api user --jq .login` must report `ValFilms`. Before setup, use
  `npm run github -- ...`. The wrapper selects the saved account credential only
  for its child process; an inherited token cannot select a different account.
- Normal Git fetch/push commands and the version scripts use the local credential
  helper automatically. Its installed copy lives in this repository's Git common
  directory so it remains available across branches and worktrees.
- Never run `gh auth switch`, shared `gh auth login/logout/setup-git`, global Git
  credential/identity changes, or shell-profile exports for this project. Never
  print a token, run the credential helper directly, log credential-fill output,
  or copy credentials into tracked files. If ValFilms authorization is missing or
  invalid, stop that operation instead of falling back to another saved account.
- Keep past authorship unchanged. New commits use the authenticated ValFilms
  identity; include `Requested-by: Yaniv` or `Requested-by: Val` in commit messages
  according to who actually requested the work, so shared-account use does not
  erase the record of who requested each change. Do not invent an attribution.
- These rules do not authorize production publication: the staging, preview,
  go-live, and numbered-restore rules above still apply.
