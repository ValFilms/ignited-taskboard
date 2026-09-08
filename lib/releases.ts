import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

export const LIVE_VERSION_URL = "https://ignited-taskboard.vercel.app/api/version";
type Version = `v${number}`;
type Reservation = {
  schema: 1;
  version: Version;
  branch: string;
  base: string;
  author: string;
  createdAt: string;
  reservation: string;
  title: string;
};
type LiveVersion = { version: Version; commit: string; environment: "production" };

export function versionNumber(value: string): number {
  if (!/^v[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value.slice(1)))) {
    throw new Error("Use a numbered version such as v7.");
  }
  return Number(value.slice(1));
}

/** Git-backed release bookkeeping. These methods never push to main or deploy. */
export class Releases {
  constructor(
    private cwd: string,
    private fetcher: typeof fetch = fetch,
  ) {}

  private git(args: string[], input?: string): string {
    return execFileSync("git", args, {
      cwd: this.cwd,
      encoding: "utf8",
      input,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  }

  private clean() {
    if (this.git(["status", "--porcelain"])) {
      throw new Error("Save the current work first. Version commands will not discard or stash it.");
    }
  }

  private sync() {
    this.git(["fetch", "--quiet", "--tags", "origin", "refs/heads/main:refs/remotes/origin/main"]);
  }

  private tags(): string[] {
    return this.git(["tag", "--list"]).split("\n").filter(t => /^(staging\/)?v[1-9]\d*$/.test(t));
  }

  private currentBranch(): string {
    return this.git(["branch", "--show-current"]);
  }

  private manifest(ref: string): Version | null {
    let text: string;
    try { text = this.git(["show", `${ref}:release.json`]); }
    catch { return null; } // Versions before this tooling was installed are unnumbered.
    const version = JSON.parse(text).version;
    if (typeof version !== "string") throw new Error(`Invalid release.json at ${ref}.`);
    versionNumber(version);
    return version as Version;
  }

  private reservation(tag: string): Reservation {
    const data = JSON.parse(this.git(["for-each-ref", "--format=%(contents)", `refs/tags/${tag}`]));
    if (data.schema !== 1 || data.version !== tag.replace("staging/", "") ||
        typeof data.branch !== "string" || typeof data.reservation !== "string") {
      throw new Error(`Invalid version reservation: ${tag}.`);
    }
    return data;
  }

  private tagObject(name: string, commit: string, metadata: object): string {
    const identity = this.git(["var", "GIT_AUTHOR_IDENT"]);
    return this.git(["mktag"], `object ${commit}\ntype commit\ntag ${name}\ntagger ${identity}\n\n${JSON.stringify(metadata, null, 2)}\n`);
  }

  private pushTag(name: string, object: string) {
    // Unique annotated objects make simultaneous reservations conflict even when
    // both collaborators start from the same commit. Never overwrite a tag.
    this.git(["-c", "push.followTags=false", "push", "origin", `${object}:refs/tags/${name}`]);
    this.git(["update-ref", `refs/tags/${name}`, object, ""]);
  }

  private saveManifest(version: Version, title: string) {
    const root = this.git(["rev-parse", "--show-toplevel"]);
    writeFileSync(join(root, "release.json"), `${JSON.stringify({ version }, null, 2)}\n`);
    this.git(["add", "--", "release.json"]);
    this.git(["commit", "-m", `Stage ${version}: ${title}`]);
  }

  stage(title = "App changes", current = false, fresh = false) {
    this.clean();
    this.sync();
    const startingBranch = this.currentBranch();
    const tags = this.tags();
    const existing = tags.filter(t => t.startsWith("staging/")).map(t => this.reservation(t))
      .filter(r => r.branch === startingBranch)
      .sort((a, b) => versionNumber(b.version) - versionNumber(a.version))[0];
    if (existing && !tags.includes(existing.version) && !fresh) {
      const manifest = this.manifest("HEAD");
      if (manifest !== existing.version) this.saveManifest(existing.version, existing.title);
      return { message: `Staging ${existing.version} now.`, version: existing.version, branch: startingBranch, resumed: true };
    }
    if (current && (!startingBranch || startingBranch === "main")) {
      throw new Error("Use a separate working branch before adopting existing work.");
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const number = Math.max(0, ...this.tags().map(t => versionNumber(t.replace("staging/", "")))) + 1;
      const version: Version = `v${number}`;
      const branch = current ? startingBranch : `codex/${version}`;
      const base = this.git(["rev-parse", current ? "HEAD" : "origin/main"]);
      const reservation: Reservation = {
        schema: 1, version, branch, base, title,
        author: this.git(["config", "user.name"]),
        createdAt: new Date().toISOString(), reservation: randomUUID(),
      };
      const name = `staging/${version}`;
      const object = this.tagObject(name, base, reservation);
      try { this.pushTag(name, object); }
      catch (error) {
        // Retry only a proven collision. Network/auth failures do not count as
        // successful reservations and do not change the working branch.
        this.sync();
        if (this.tags().includes(name) && this.reservation(name).reservation !== reservation.reservation) continue;
        throw error;
      }
      if (!current) this.git(["switch", "--no-track", "-c", branch, base]);
      this.saveManifest(version, title);
      return { message: `Staging ${version} now.`, version, branch, resumed: false };
    }
    throw new Error("Other collaborators reserved versions simultaneously. Retry staging.");
  }

  candidate() {
    this.clean();
    this.sync();
    const version = this.manifest("HEAD");
    if (!version) throw new Error("This work has no staged version. Stage it first.");
    const commit = this.git(["rev-parse", "HEAD"]);
    const main = this.git(["rev-parse", "origin/main"]);
    try { this.git(["merge-base", "--is-ancestor", main, commit]); }
    catch { throw new Error("Your partner changed main. Incorporate the latest work and validate again before go live."); }
    if (this.tags().includes(version)) {
      if (this.git(["rev-parse", `${version}^{tree}`]) !== this.git(["rev-parse", `${commit}^{tree}`])) {
        throw new Error(`${version} is a saved snapshot and cannot be changed. Stage a new version.`);
      }
      return { version, commit, expectedMain: main, kind: "restore" as const };
    }
    const reservation = this.tags().includes(`staging/${version}`) ? this.reservation(`staging/${version}`) : null;
    if (!reservation || reservation.branch !== this.currentBranch()) {
      throw new Error("This branch does not own that staging version.");
    }
    const mainVersion = this.manifest("origin/main");
    const newest = Math.max(0, ...this.tags().filter(t => t.startsWith("v")).map(versionNumber),
      mainVersion ? versionNumber(mainVersion) : 0);
    if (versionNumber(version) <= newest && commit !== main) {
      throw new Error("A newer version has already shipped. Reserve a new number with stage --current --new, then validate.");
    }
    return { version, commit, expectedMain: main, kind: "staging" as const };
  }

  restore(value: string) {
    versionNumber(value);
    const version = value as Version;
    this.clean();
    this.sync();
    if (!this.tags().includes(version)) throw new Error(`${version} is not a saved release.`);
    if (this.manifest(version) !== version) throw new Error(`${version} does not contain a matching version marker.`);
    const sourceCommit = this.git(["rev-parse", `${version}^{commit}`]);
    const tree = this.git(["rev-parse", `${version}^{tree}`]);
    const previousMain = this.git(["rev-parse", "origin/main"]);
    const commit = this.git(["commit-tree", tree, "-p", previousMain, "-m", `Restore ${version}\n\nRestore the full saved app snapshot ${sourceCommit}. Preserve newer history.`]);
    const branch = `codex/restore-${version}-${randomUUID().slice(0, 8)}`;
    this.git(["switch", "-c", branch, commit]);
    return { message: `Preparing to restore ${version}.`, version, branch, commit, sourceCommit, previousMain };
  }

  async live(): Promise<LiveVersion> {
    const response = await this.fetcher(LIVE_VERSION_URL, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Live version could not be verified (HTTP ${response.status}).`);
    const value = await response.json();
    if (typeof value.version !== "string" || typeof value.commit !== "string" ||
        !/^[0-9a-f]{40,64}$/.test(value.commit) || value.environment !== "production") {
      throw new Error("The live endpoint did not identify a versioned production deployment.");
    }
    versionNumber(value.version);
    return value as LiveVersion;
  }

  async record(value: string) {
    versionNumber(value);
    this.clean();
    this.sync();
    const commit = this.git(["rev-parse", "HEAD"]);
    if (this.manifest(commit) !== value) throw new Error("The requested version does not match this commit.");
    try { this.git(["merge-base", "--is-ancestor", commit, "origin/main"]); }
    catch { throw new Error("The candidate has not been published to main."); }
    const live = await this.live();
    if (live.version !== value || live.commit !== commit) {
      throw new Error("This exact version and commit are not live. No saved-release tag was created.");
    }
    if (this.tags().includes(value)) {
      if (this.git(["rev-parse", `${value}^{tree}`]) !== this.git(["rev-parse", `${commit}^{tree}`])) {
        throw new Error(`${value} already names a different snapshot. It will not be overwritten.`);
      }
      return { message: `${value} is live.`, version: value, commit, restored: true };
    }
    if (!this.tags().includes(`staging/${value}`) || this.reservation(`staging/${value}`).branch !== this.currentBranch()) {
      throw new Error("The staging reservation does not match this branch.");
    }
    const metadata = { schema: 1, version: value, commit, author: this.git(["config", "user.name"]),
      publishedAt: new Date().toISOString(), url: LIVE_VERSION_URL };
    this.pushTag(value, this.tagObject(value, commit, metadata));
    return { message: `${value} is live.`, version: value, commit, restored: false };
  }

  async history() {
    this.sync();
    const tags = this.tags();
    const numbers = [...new Set(tags.map(t => versionNumber(t.replace("staging/", ""))))].sort((a, b) => a - b);
    const versions = numbers.map(number => {
      const version = `v${number}`;
      const saved = tags.includes(version);
      const reservation = tags.includes(`staging/${version}`) ? this.reservation(`staging/${version}`) : null;
      return { version, state: saved ? "saved" : "staging", branch: reservation?.branch,
        author: reservation?.author, title: reservation?.title, startedAt: reservation?.createdAt,
        commit: saved ? this.git(["rev-parse", `${version}^{commit}`]) : null };
    });
    let live: LiveVersion | null = null;
    let liveError: string | null = null;
    try { live = await this.live(); } catch (error) { liveError = (error as Error).message; }
    return { live, liveError, versions };
  }
}
