import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const source = resolve("scripts/github.mjs");
const repository = "ValFilms/ignited-taskboard";
const remote = `https://github.com/${repository}.git`;
const fakeToken = "fixture-only-ValFilms-token";

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "ignited account's "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cwd = join(root, "project");
  const bin = join(root, "bin");
  const global = join(root, "global.gitconfig");
  const active = join(root, "active-account");
  const log = join(root, "calls.jsonl");
  mkdirSync(cwd); mkdirSync(bin);
  writeFileSync(active, "yitskovich");
  writeFileSync(global, '[user]\n name = Personal\n email = personal@example.test\n[credential]\n helper = shared-personal-helper\n');
  writeFileSync(join(bin, "gh"), `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FIXTURE_LOG, JSON.stringify({args, token:process.env.GH_TOKEN, githubToken:process.env.GITHUB_TOKEN, repo:process.env.GH_REPO})+"\\n");
if (args[0] === "auth" && args[1] === "token") {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN || args.join(" ") !== "auth token --hostname github.com --user ValFilms" || process.env.FIXTURE_MISSING) {
    console.error("credential lookup failed: ${fakeToken}"); process.exit(1);
  }
  console.log("${fakeToken}");
} else if (args[0] === "api" && args[1] === "user") {
  const valid = process.env.GH_TOKEN === "${fakeToken}" && !process.env.FIXTURE_WRONG_USER;
  console.log(JSON.stringify({login:valid?"ValFilms":fs.readFileSync(process.env.FIXTURE_ACTIVE,"utf8"),id:valid?204383632:1}));
} else if (args[0] === "auth") {
  fs.writeFileSync(process.env.FIXTURE_ACTIVE,"unexpected-change"); process.exit(1);
} else {
  if (process.env.GH_TOKEN !== "${fakeToken}") process.exit(1);
  console.log(JSON.stringify({args,repository:process.env.GH_REPO}));
}
`, { mode: 0o755 });
  const env = { ...process.env, PATH: `${bin}:${dirname(process.execPath)}:${process.env.PATH}`,
    GIT_CONFIG_GLOBAL: global, GIT_CONFIG_NOSYSTEM: "1", GH_CONFIG_DIR: join(root, "gh"),
    FIXTURE_ACTIVE: active, FIXTURE_LOG: log, GH_TOKEN: "unrelated-inherited-token", GITHUB_TOKEN: "also-unrelated" };
  for (const key of ["GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL", "GIT_DIR", "GIT_WORK_TREE"]) delete env[key as keyof typeof env];
  function run(command: string, args: string[], options: { cwd?: string; input?: string; env?: Partial<NodeJS.ProcessEnv> } = {}) {
    return spawnSync(command, args, { cwd: options.cwd ?? cwd, env: { ...env, ...options.env }, encoding: "utf8", input: options.input });
  }
  function git(...args: string[]) {
    const result = run("git", args);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  function script(...args: string[]) { return run(process.execPath, [source, ...args]); }
  git("init", "-b", "main");
  git("remote", "add", "origin", remote);
  writeFileSync(join(cwd, "app.txt"), "sample app");
  git("add", "."); git("commit", "-m", "Initial app");
  const initial = git("rev-parse", "HEAD");
  function calls() { return existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : []; }
  return { root, cwd, global, active, env, run, git, script, calls, initial };
}

test("project setup pins credentials and identity without changing the shared account or another repo", t => {
  const f = fixture(t);
  const globalBefore = readFileSync(f.global, "utf8");
  assert.equal(f.script("setup").status, 0);
  assert.equal(f.git("config", "--local", "user.name"), "ValFilms");
  assert.equal(f.git("config", "--local", "user.email"), "204383632+ValFilms@users.noreply.github.com");
  assert.equal(f.git("config", "--local", "ignited.githubAccount"), "ValFilms");
  const helpers = f.git("config", "--local", "--get-all", `credential.${remote}.helper`);
  assert.ok(helpers.includes("github.mjs"));
  assert.equal(f.git("config", "--local", "--get", "credential.https://github.com.useHttpPath"), "true");
  assert.equal(f.run("git", ["github", "identity"]).status, 0);
  assert.equal(JSON.parse(f.run("git", ["github", "identity"]).stdout).login, "ValFilms");
  const configBefore = readFileSync(join(f.cwd, ".git", "config"), "utf8");
  assert.equal(f.script("setup").status, 0, "setup is safe to repeat");
  assert.equal(readFileSync(join(f.cwd, ".git", "config"), "utf8"), configBefore);
  assert.equal(readFileSync(f.global, "utf8"), globalBefore);
  assert.equal(readFileSync(f.active, "utf8"), "yitskovich");
  assert.ok(!configBefore.includes(fakeToken));
  const other = join(f.root, "other-project"); mkdirSync(other);
  assert.equal(f.run("git", ["init"], { cwd: other }).status, 0);
  assert.equal(f.run("git", ["config", "user.name"], { cwd: other }).stdout.trim(), "Personal");
  assert.notEqual(f.run("git", ["config", "alias.github"], { cwd: other }).status, 0);
});

test("GitHub commands select the saved ValFilms account despite inherited tokens", t => {
  const f = fixture(t);
  const result = f.script("pr", "view", "1");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { args: ["pr", "view", "1"], repository });
  assert.equal(f.calls()[0].token, undefined);
  assert.equal(f.calls()[0].githubToken, undefined);
  assert.equal(f.calls().at(-1).token, fakeToken);
  assert.equal(f.calls().at(-1).githubToken, undefined);
  assert.ok(!result.stdout.includes(fakeToken));
  assert.equal(readFileSync(f.active, "utf8"), "yitskovich");
});

test("Git credentials override inherited helpers only for this project and are never stored globally", t => {
  const f = fixture(t); assert.equal(f.script("setup").status, 0);
  const request = `protocol=https\nhost=github.com\npath=${repository}.git\n\n`;
  // Synthetic credentials only. Captured protocol output must never be logged
  // by production verification commands.
  const result = f.run("git", ["credential", "fill"], { input: request });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "", "the unrelated global helper must not be called");
  assert.ok(result.stdout.includes("username=ValFilms"));
  assert.ok(result.stdout.includes(`password=${fakeToken}`));
  const before = f.calls().length;
  assert.equal(f.run("git", ["credential", "approve"], { input: result.stdout }).status, 0);
  assert.equal(f.run("git", ["credential", "reject"], { input: result.stdout }).status, 0);
  assert.equal(f.calls().length, before, "store and erase do not touch the shared account");
  const installed = join(f.cwd, ".git", "ignited", "github.mjs");
  for (const input of [request.replace("github.com", "other.example"), request.replace(repository, "ValFilms/other-project"), request.replace("https", "http"), request.replace("\n\n", "\nusername=SomeoneElse\n\n")]) {
    const denied = f.run(process.execPath, [installed, "credential", "get"], { input });
    assert.equal(denied.stdout, "quit=true\n\n");
  }
  assert.equal(f.calls().length, before, "unrelated credential requests never retrieve a token");
});

test("missing or mismatched credentials stop operations without leaking or falling back", t => {
  const f = fixture(t);
  for (const env of [{ FIXTURE_MISSING: "1" }, { FIXTURE_WRONG_USER: "1" }]) {
    const result = f.run(process.execPath, [source, "setup"], { env });
    assert.notEqual(result.status, 0);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(fakeToken));
    assert.equal(f.run("git", ["config", "--local", "ignited.githubAccount"]).status, 1);
    assert.equal(readFileSync(f.active, "utf8"), "yitskovich");
  }
  assert.equal(f.script("setup").status, 0);
  const expired = f.run("git", ["credential", "fill"], {
    env: { FIXTURE_MISSING: "1", GIT_TERMINAL_PROMPT: "0" },
    input: `protocol=https\nhost=github.com\npath=${repository}.git\n\n`,
  });
  assert.notEqual(expired.status, 0);
  assert.ok(!`${expired.stdout}${expired.stderr}`.includes(fakeToken));
  assert.equal(readFileSync(f.active, "utf8"), "yitskovich");
});

test("global account changes and use in unrelated projects are rejected", t => {
  const f = fixture(t);
  for (const args of [["auth", "switch"], ["auth", "login"], ["auth", "token"], ["config", "set"], ["alias", "set"], ["extension", "install"]]) {
    assert.notEqual(f.script(...args).status, 0);
  }
  assert.equal(f.calls().length, 0);
  f.git("remote", "set-url", "origin", "https://github.com/yitskovich/unrelated.git");
  assert.notEqual(f.script("setup").status, 0);
  assert.notEqual(f.script("api", "user").status, 0);
  assert.equal(f.calls().length, 0);
  assert.equal(readFileSync(f.active, "utf8"), "yitskovich");
});

test("the installed helper survives older branches and works from linked worktrees", t => {
  const f = fixture(t);
  mkdirSync(join(f.cwd, "scripts"));
  writeFileSync(join(f.cwd, "scripts", "github.mjs"), readFileSync(source));
  f.git("add", "."); f.git("commit", "-m", "Add project helper");
  assert.equal(f.script("setup").status, 0);
  f.git("switch", "-c", "older-branch", f.initial);
  assert.equal(existsSync(join(f.cwd, "scripts", "github.mjs")), false);
  assert.equal(f.run("git", ["github", "identity"]).status, 0);
  const worktree = join(f.root, "linked worktree");
  f.git("worktree", "add", worktree, "main");
  const result = f.run("git", ["github", "identity"], { cwd: worktree });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).login, "ValFilms");
});
