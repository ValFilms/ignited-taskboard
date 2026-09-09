# Ignited taskboard project instructions

Read and follow @AGENTS.md for this repository, including its release workflow.

**Before every new request or resumed task, complete the mandatory update check
in AGENTS.md before editing anything.** Verify the project account, successfully
fetch all origin branches and tags, compare main and the working branch's remote,
read their latest instructions, and safely incorporate incoming work. Check the
live/version history and briefly report the result. This includes small fixes and
documentation changes. If fetching fails, stop edits instead of using stale code.
Recheck before final validation and pushes; preserve local work and other people's
changes. Read-only status requests inspect without merging, and numbered restores
retain the saved file tree as specified in AGENTS.md.

Use the authorized **ValFilms** GitHub account for this project only. Run
`npm run github -- setup` on a new clone or after the helper changes, then use
`git github ...` for GitHub operations and `git github identity` to verify access.
Git fetch/push uses the installed repository-local credential helper.

Do not switch the shared `gh` login, change global Git credentials/identity, or
alter another project's account. Preserve existing commit authorship and record
who requested new work. Missing ValFilms access must stop the operation rather
than select a different account. Never expose credentials in output or files.

Provide a verified staging preview for testing. Publish only after the owner's
explicit go-live instruction, or their explicit request to restore a saved version.
