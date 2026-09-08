import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Releases, versionNumber } from "../lib/releases";
import { GET } from "../app/api/version/route";
import release from "../release.json";

const cli = resolve("scripts/versions.ts");
const loader = resolve("node_modules/tsx/dist/cli.mjs");
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, {
  cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
}).trim();

function fixture(t: { after: (fn: () => void) => void }) {
  const root = mkdtempSync(join(tmpdir(), "ignited-release-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const remote = join(root, "remote.git");
  git(root, "init", "--bare", "--initial-branch=main", remote);
  const clone = (name: string) => {
    const path = join(root, name);
    git(root, "clone", remote, path);
    git(path, "config", "user.name", name);
    git(path, "config", "user.email", `${name}@example.test`);
    git(path, "config", "commit.gpgsign", "false");
    git(path, "config", "tag.gpgsign", "false");
    git(path, "config", "core.hooksPath", join(root, "no-hooks"));
    return path;
  };
  const a = clone("first");
  const save = (path: string, content: string) => {
    writeFileSync(join(path, "app.txt"), content);
    git(path, "add", ".");
    git(path, "commit", "-m", content);
    return git(path, "rev-parse", "HEAD");
  };
  const initial = save(a, "original app");
  git(a, "push", "origin", "HEAD:refs/heads/main");
  let live: object = {};
  const fetcher = (async () => Response.json(live)) as typeof fetch;
  const releases = new Releases(a, fetcher);
  const publish = (version: string) => {
    const commit = git(a, "rev-parse", "HEAD");
    git(a, "push", "origin", "HEAD:refs/heads/main");
    live = { version, commit, environment: "production" };
    return commit;
  };
  return { root, remote, a, clone, save, releases, publish, initial, setLive: (value: object) => { live = value; } };
}

test("staging reserves a number globally, resumes it, and leaves main untouched", t => {
  const f = fixture(t);
  assert.equal(f.releases.stage("Calendar").message, "Staging v1 now.");
  assert.equal(git(f.a, "branch", "--show-current"), "codex/v1");
  assert.equal(JSON.parse(readFileSync(join(f.a, "release.json"), "utf8")).version, "v1");
  assert.equal(git(f.remote, "rev-parse", "refs/heads/main"), f.initial);
  const head = git(f.a, "rev-parse", "HEAD");
  assert.equal(f.releases.stage("Continue").resumed, true);
  assert.equal(git(f.a, "rev-parse", "HEAD"), head);
  assert.equal(f.releases.candidate().kind, "staging");
});

test("dirty work and invalid version names are rejected without discarding files", t => {
  const f = fixture(t);
  writeFileSync(join(f.a, "unfinished.txt"), "keep me");
  assert.throws(() => f.releases.stage(), /Save the current work/);
  assert.throws(() => f.releases.restore("v1"), /Save the current work/);
  for (const version of ["v0", "v01", "--help", "v1; rm", "v1.2", "v9007199254740992"]) {
    assert.throws(() => versionNumber(version), /numbered version/);
  }
  assert.equal(readFileSync(join(f.a, "unfinished.txt"), "utf8"), "keep me");
  assert.equal(git(f.remote, "rev-parse", "refs/heads/main"), f.initial);
});

test("two collaborators starting together receive different staging numbers", { timeout: 30000 }, async t => {
  const f = fixture(t);
  const b = f.clone("second");
  const start = (cwd: string) => new Promise<any>((resolveRun, reject) => {
    const child = spawn(process.execPath, [loader, cli, "stage", "Parallel work"], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let output = "", error = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { error += chunk; });
    child.on("error", reject);
    child.on("close", code => {
      if (code !== 0) reject(new Error(error));
      else { try { resolveRun(JSON.parse(output)); } catch (e) { reject(e); } }
    });
  });
  const results = await Promise.all([start(f.a), start(b)]);
  assert.deepEqual(results.map(r => r.version).sort(), ["v1", "v2"]);
  assert.equal(git(f.remote, "rev-parse", "refs/heads/main"), f.initial);
  assert.notEqual(git(f.remote, "rev-parse", "refs/tags/staging/v1"), git(f.remote, "rev-parse", "refs/tags/staging/v2"));
});

test("a rejected reservation never announces success or changes the working branch", t => {
  const f = fixture(t);
  const hook = join(f.remote, "hooks", "pre-receive");
  writeFileSync(hook, "#!/bin/sh\nexit 1\n");
  chmodSync(hook, 0o755);
  assert.throws(() => f.releases.stage());
  assert.equal(git(f.a, "branch", "--show-current"), "main");
  assert.equal(existsSync(join(f.a, "release.json")), false);
  assert.equal(git(f.remote, "tag", "--list"), "");
});

test("partner changes make a candidate stale instead of being overwritten", t => {
  const f = fixture(t);
  const b = f.clone("second");
  f.releases.stage("My work");
  const partner = f.save(b, "partner regression fixes");
  git(b, "push", "origin", "HEAD:refs/heads/main");
  assert.throws(() => f.releases.candidate(), /partner changed main/);
  assert.equal(git(f.remote, "rev-parse", "refs/heads/main"), partner);
  assert.equal(readFileSync(join(f.a, "app.txt"), "utf8"), "original app");
});

test("saved versions require the exact production commit, not just a successful push", async t => {
  const f = fixture(t);
  f.releases.stage("First release");
  await assert.rejects(f.releases.record("v1"), /not been published to main/);
  const commit = f.publish("v1");
  f.setLive({ version: "v1", commit: f.initial, environment: "production" });
  await assert.rejects(f.releases.record("v1"), /not live/);
  assert.equal(git(f.remote, "tag", "--list", "v1"), "");
  f.setLive({ version: "v1", commit, environment: "preview" });
  await assert.rejects(f.releases.record("v1"), /production deployment/);
  f.setLive({ version: "v1", commit, environment: "production" });
  assert.equal((await f.releases.record("v1")).message, "v1 is live.");
  assert.equal(git(f.remote, "rev-parse", "v1^{commit}"), commit);
  const tagObject = git(f.remote, "rev-parse", "v1");
  await f.releases.record("v1");
  assert.equal(git(f.remote, "rev-parse", "v1"), tagObject);
});

test("restoring a version restores its full tree, keeps newer history, and never reuses numbers", async t => {
  const f = fixture(t);
  f.releases.stage("First release");
  f.save(f.a, "version one");
  const first = f.publish("v1");
  await f.releases.record("v1");
  f.releases.stage("Second release");
  writeFileSync(join(f.a, "only-in-v2.txt"), "new feature");
  f.save(f.a, "version two");
  const second = f.publish("v2");
  await f.releases.record("v2");
  const restore = f.releases.restore("v1");
  assert.equal(git(f.remote, "rev-parse", "main"), second, "preparing rollback must not deploy it");
  assert.equal(git(f.a, "rev-parse", "HEAD^{tree}"), git(f.a, "rev-parse", "v1^{tree}"));
  assert.equal(git(f.a, "rev-parse", "HEAD^"), second, "newer history must be retained");
  assert.equal(existsSync(join(f.a, "only-in-v2.txt")), false);
  assert.equal(readFileSync(join(f.a, "app.txt"), "utf8"), "version one");
  assert.equal(f.releases.candidate().kind, "restore");
  f.publish("v1");
  assert.equal((await f.releases.record("v1")).restored, true);
  assert.equal(git(f.remote, "rev-parse", "v1^{commit}"), first);
  assert.equal(git(f.remote, "rev-parse", "v2^{commit}"), second);
  assert.equal(f.releases.stage("Next change").version, "v3");
  const history = await f.releases.history();
  assert.equal(history.live?.version, "v1");
  assert.equal(history.live?.commit, restore.commit);
  assert.deepEqual(history.versions.map(v => [v.version, v.state]), [["v1", "saved"], ["v2", "saved"], ["v3", "staging"]]);
});

test("a saved version cannot be silently changed or restored before being saved", async t => {
  const f = fixture(t);
  f.releases.stage("First");
  assert.throws(() => f.releases.restore("v1"), /not a saved release/);
  const first = f.publish("v1");
  await f.releases.record("v1");
  f.save(f.a, "different app pretending to be v1");
  assert.throws(() => f.releases.candidate(), /cannot be changed/);
  f.publish("v1");
  await assert.rejects(f.releases.record("v1"), /will not be overwritten/);
  assert.equal(git(f.remote, "rev-parse", "v1^{commit}"), first);
});

test("a newer published version requires restaging an older candidate with a fresh number", async t => {
  const f = fixture(t);
  f.releases.stage("Old candidate");
  const b = f.clone("second");
  const other = new Releases(b, (async () => Response.json({ version: "v2", commit: git(b, "rev-parse", "HEAD"), environment: "production" })) as typeof fetch);
  assert.equal(other.stage("Newer candidate").version, "v2");
  git(b, "push", "origin", "HEAD:refs/heads/main");
  await other.record("v2");
  git(f.a, "fetch", "origin");
  // Include the newer app history while retaining the older candidate's marker.
  git(f.a, "merge", "-s", "ours", "origin/main", "-m", "Include newer history for release-order test");
  assert.throws(() => f.releases.candidate(), /newer version has already shipped/);
  assert.equal(f.releases.stage("Restaged", true, true).version, "v3");
  assert.equal(f.releases.candidate().version, "v3");
  f.publish("v3");
  await f.releases.record("v3");
  assert.equal(f.releases.stage("Next task").version, "v4", "must not resume the superseded v1 reservation");
});

test("version endpoint identifies the actual deployment without caching or credentials", async () => {
  const previous = { environment: process.env.VERCEL_ENV, commit: process.env.VERCEL_GIT_COMMIT_SHA };
  try {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_GIT_COMMIT_SHA = "a".repeat(40);
    const response = GET();
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { version: release.version, environment: "preview", commit: "a".repeat(40) });
  } finally {
    for (const [key, value] of [["VERCEL_ENV", previous.environment], ["VERCEL_GIT_COMMIT_SHA", previous.commit]]) {
      if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
    }
  }
});
