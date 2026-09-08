# Staging, going live, and restoring versions

Both collaborators use a copy of this repository. For this project the owners
authorized the ValFilms GitHub account. The shared `AGENTS.md` and `CLAUDE.md`
tell the coding agents how to handle accounts, staging, and release steps.

## Project-specific GitHub account

Run `npm run github -- setup` once per clone and after helper updates. It checks
the saved ValFilms authorization, then installs settings in this repository only.
Afterward, `git github identity` must report `ValFilms`; use `git github ...`
where you would normally use `gh ...`. Git fetch/push and the version scripts use
the account automatically. Node and GitHub CLI are required.

The helper reads the account's existing credential from GitHub CLI's credential
store and supplies it to one process at a time. It never switches the shared
active account or saves tokens in the repository. Other repositories and Claude
sessions keep their existing account selection. An expired or missing ValFilms
credential stops the command; another account is never silently substituted.

Local commit identity is ValFilms, matching the authorized account. Existing
commits retain their original authors. New commit messages record who requested
the work (`Requested-by: Yaniv` or `Requested-by: Val`, when known).

The local alias and credential helper survive branch changes and apply to this
repository's worktrees. They do not install themselves in unrelated checkouts.
Bare `gh` still uses the machine's shared default, so agents must use `git github`.

## Your everyday workflow

| You say | Codex does |
| --- | --- |
| "Add a calendar" | Announces "Staging v8 now", using the actual next number, then prepares the change separately. |
| "Change the colours too" | Continues that staged version and provides an updated preview link to test. |
| "Go live" | Publishes the exact code shown in the confirmed preview after the checks pass. Reports "v8 is live" after verifying it. |
| "Revert to v7" | Restores the complete saved v7 app, checks and publishes it, then confirms "v7 is live again". |
| "Show version history" | Lists staged and saved versions and checks which version is currently live. |

The numbers above are examples. This project's first numbered candidate is **v1**.
The pre-existing live app is unnumbered until the first numbered release succeeds.
Creating a staging version does not change the live app.

No approval from the other partner is required. "Go live" authorizes a staged
release. "Revert to v7" authorizes restoring that saved release without needing a
second "go live" command.

## Try the staging version before publishing

Each staged version must have a working preview link where both owners can open
the app, try the changes, and request fixes. Codex provides that link with the
version number, a short change summary, and the automated check results. When you
have tested it and are happy, say **go live**. Either owner can confirm the release.

The shared link identifies the exact deployment you were shown. If code changes
after that preview, including new partner changes, Codex provides an updated
preview and waits for your confirmation of that version before publishing.
Automated tests alone do not replace your chance to try the app.

Test edits use fictional demo data or a separate staging database. Demo mode can
exercise interface and workflow changes, but real sign-in and file upload testing
requires a separate configured test workspace. A separate preview URL by itself
does not isolate client data. Codex reports which testing mode is available.

Vercel creates these previews from staging-branch pushes. See its documentation on
[Preview environments](https://vercel.com/docs/deployments/environments#preview-environment-pre-production)
and [deployment URLs](https://vercel.com/docs/deployments/generated-urls).

## What a saved version means

Each published version has an immutable Git tag (`v1`, `v2`, and so on) pointing to
its exact code snapshot. You can find these under the repository's **Tags** view.
Commits preserve who changed what; `npm run versions -- history` lists the numbered
versions with their author, description, and staging time.

Staging numbers are reserved in shared Git tags (`staging/vN`). Two collaborators
cannot successfully reserve the same number. Concurrent work uses separate
branches/worktrees. Unused numbers may leave gaps, and numbers are never reused:
after restoring v7 from v8, the next new stage is v9 (or higher if already reserved).

The agent incorporates newer partner changes and retests before publishing. If a
newer version ships before an older candidate is ready, the older candidate gets
a fresh staging number before it can be released.

## Restoring v7

This restores the **whole app as saved in v7**, so all newer app changes are removed
from the live version, regardless of who made them. The newer commits and saved
versions remain available. Restoration creates a new commit rather than rewriting
Git history. Codex can later restore another saved version.

This restores code, not client/task records, uploads, or external integrations.
Database backups and data recovery are separate. Older code still needs to be
compatible with the current database schema before being put live.

## Under the hood

These commands are for Codex to run; you can use the short requests above.

- `npm run versions -- stage <description>` reserves a number, creates a branch
  from latest main, and commits its version marker. `--current` adopts existing
  work on a separate branch; `--current --new` replaces an obsolete staging number.
- `npm run versions -- candidate` checks that a candidate includes latest main,
  owns its staging number, and does not change an already-saved snapshot.
- `npm run versions -- restore v7` prepares a separate branch with the exact v7
  file tree and the current main commit as its parent. It does not deploy.
- `npm run versions -- record v8` verifies the live `/api/version` response against
  the exact commit before saving its tag. For a restoration it verifies the old
  snapshot while leaving its original tag intact.
- `npm run versions -- history` reports saved/staged versions and live status.

The helper never pushes to main. The agent runs Node 24, `npm ci`, and
`npm run check`, waits for GitHub's **Tests and build** check, then fast-forwards
main only after your go-live or revert instruction. Vercel handles the deployment.
The read-only `/api/version` endpoint reports the version, environment, and commit;
it does not expose credentials or client records. Vercel's Git commit system
variable must be available for exact release verification.

## Remaining hosting setup

GitHub and Vercel access are separate. A collaborator must have the Vercel access
needed to deploy their commits. Failed or blocked deployments are never reported
as live or recorded as saved versions. CI does not need production secrets.

Use demo mode or a dedicated staging Supabase project for test edits: a Preview
URL may still point to the production database through its environment variables.
The existing live address is https://ignited-taskboard.vercel.app.

GitHub checks alone do not block direct pushes from deploying on Vercel. Shared
agent instructions require passing checks and your publishing instruction; an
administrator can additionally enforce checks through repository rules without
requiring another person's approval.
