# Making changes together

Both collaborators use their own GitHub account and a local copy of this same
repository in Codex. The shared `AGENTS.md` tells Codex how to handle the Git steps.
You do not need to create branches or review each other's pull requests manually.

## What to say to Codex

**Request a change:**

> Make [describe the change]. Bring in the latest shared code, prepare it on a
> separate branch, run the checks, and show me a preview. Wait for me to say publish.

**After checking the result:**

> Publish this change. Include any newer changes from my partner, check the combined
> version, and tell me when the Vercel deployment is live.

Codex asks for a decision if changes conflict in intent or the combined version
materially changes the result you confirmed. Otherwise it handles the Git steps.

## What happens automatically

- Codex reads the shared instructions, starts from the latest code, and keeps each
  task on its own working branch. Each person's commits retain their identity.
- GitHub Actions runs `npm run check` on every pushed branch and on pull requests
  into `main`. This includes tests, TypeScript validation, and the production build.
- The existing Vercel GitHub integration handles deployments. Non-production
  branches normally produce Preview deployments; the agent must confirm an actual
  successful Preview for the commit before giving you its link.
- Publishing the tested commit to `main` triggers the existing Production deployment.
  Codex waits for that deployment before reporting success.

The GitHub **Commits** history records authors, dates, and exact file changes.
Pull requests, when used, keep a convenient summary and test/deployment results.
Reverting a change creates a new history entry instead of erasing other work.

## Setup and limits

- Node 24 and npm are the supported development tools (`.nvmrc`). Run `npm ci`
  after cloning or when the dependency lockfile changes.
- Each collaborator must authenticate GitHub CLI as their own account. Any Git
  author configuration should be local to this repository.
- GitHub access and Vercel deployment access are separate. If Vercel rejects a
  collaborator's commits, its project/team owner must grant the appropriate
  access. Do not attribute commits to the other person to work around this.
- CI runs without production secrets. Existing tests use fictional data and a
  mocked Supabase transport; they do not validate your live Supabase, storage,
  Google Form, or reminder scheduler setup.
- A preview URL separates code versions, not necessarily databases. Use demo
  mode (no Supabase configuration) or a dedicated staging project for test edits.
- GitHub checks do not by themselves block Vercel deployment. Shared agent
  instructions require passing checks and your explicit publishing instruction.
  A repository administrator can additionally require the **Tests and build**
  check through repository rules without requiring another person's approval.

## Current release mechanism

`main` is the production branch. The live address is
https://ignited-taskboard.vercel.app. Routine edits must be pushed to a working
branch, not directly to `main`.

Before publishing, the agent includes the latest `origin/main`, validates the
candidate, then fast-forwards `main` to that exact tested commit. A concurrent
release causes a non-fast-forward rejection, so the agent fetches and checks again
instead of overwriting it. Failed deployments must be investigated before claiming
the change is live.
