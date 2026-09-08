#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const account = "ValFilms";
const accountId = 204383632;
const repository = "ValFilms/ignited-taskboard";
const origin = `https://github.com/${repository}.git`;
const credentialScope = `credential.${origin}`;

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error("Could not read or configure this Git checkout.");
  return result.stdout.trim();
}

function projectRoot() {
  const root = git(["rev-parse", "--show-toplevel"]);
  if (git(["remote", "get-url", "origin"]) !== origin ||
      git(["remote", "get-url", "--push", "origin"]) !== origin) {
    throw new Error(`This command only supports the ${repository} checkout with its canonical HTTPS origin.`);
  }
  return root;
}

function cleanEnvironment() {
  const env = { ...process.env };
  // An inherited token must never override the explicitly selected account.
  for (const key of ["GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN", "GH_DEBUG"]) {
    delete env[key];
  }
  return { ...env, GH_HOST: "github.com", GH_REPO: repository, GH_PROMPT_DISABLED: "1" };
}

function authorizedEnvironment() {
  const env = cleanEnvironment();
  const saved = spawnSync("gh", ["auth", "token", "--hostname", "github.com", "--user", account], {
    env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15000,
  });
  const token = saved.stdout?.trim();
  if (saved.status !== 0 || !token || /\s/.test(token)) {
    throw new Error("ValFilms authorization is unavailable. Stop and arrange isolated reauthorization; do not switch the shared GitHub login.");
  }
  const authorized = { ...env, GH_TOKEN: token };
  const result = spawnSync("gh", ["api", "user", "--hostname", "github.com"], {
    env: authorized, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000,
  });
  let user;
  try { user = JSON.parse(result.stdout); } catch { /* Report a safe error below. */ }
  if (result.status !== 0 || user?.login !== account || user?.id !== accountId) {
    throw new Error("Could not verify the authorized ValFilms account. No other account will be used.");
  }
  return authorized;
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function setup() {
  authorizedEnvironment(); // Verify access before changing local configuration.
  const common = resolve(git(["rev-parse", "--path-format=absolute", "--git-common-dir"]));
  const directory = join(common, "ignited");
  const installed = join(directory, "github.mjs");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(installed, readFileSync(fileURLToPath(import.meta.url)), { mode: 0o700 });
  // Store executable code only, never a token. The installed copy survives branch
  // changes and is shared by this repository's worktrees, not other projects.
  const command = `!node ${shellQuote(installed)}`;
  const values = [
    ["alias.github", command],
    ["credential.https://github.com.useHttpPath", "true"],
    [`${credentialScope}.username`, account],
    ["user.name", account],
    ["user.email", `${accountId}+${account}@users.noreply.github.com`],
    ["ignited.githubAccount", account],
  ];
  for (const [key, value] of values) git(["config", "--local", key, value]);
  // Empty value clears inherited helpers for THIS repository URL. In particular,
  // never save its credentials into the shared macOS Git credential entry.
  git(["config", "--local", "--replace-all", `${credentialScope}.helper`, ""]);
  git(["config", "--local", "--add", `${credentialScope}.helper`, `${command} credential`]);
  console.log("This checkout now uses ValFilms. Use git github for GitHub commands. Shared account settings were not changed.");
}

function credential(operation) {
  if (operation !== "get") return; // store/erase never modify shared credentials.
  const fields = Object.fromEntries(readFileSync(0, "utf8").split("\n").filter(Boolean).map(line => {
    const at = line.indexOf("=");
    return [line.slice(0, at), line.slice(at + 1)];
  }));
  if (fields.protocol !== "https" || fields.host !== "github.com" ||
      fields.path !== `${repository}.git` || (fields.username && fields.username !== account)) {
    process.stdout.write("quit=true\n\n");
    return;
  }
  try {
    const env = authorizedEnvironment();
    // This stdout is Git's credential protocol, consumed by Git only. Never run
    // the helper directly in an agent transcript or log credential-fill output.
    process.stdout.write(`username=${account}\npassword=${env.GH_TOKEN}\n\n`);
  } catch (error) {
    process.stdout.write("quit=true\n\n");
    throw error;
  }
}

function main() {
  const [command = "identity", ...args] = process.argv.slice(2);
  if (command === "credential") return credential(args[0]);
  const root = projectRoot();
  if (command === "setup" && args.length === 0) return setup();
  if (["auth", "config", "alias", "extension"].includes(command)) {
    throw new Error("Account and global CLI configuration changes are disabled here. Use identity to check project access.");
  }
  const env = authorizedEnvironment();
  if (command === "identity" && args.length === 0) {
    console.log(JSON.stringify({ login: account, id: accountId, repository, sharedLoginChanged: false }));
    return;
  }
  const result = spawnSync("gh", [command, ...args], { cwd: root, env, stdio: "inherit" });
  process.exitCode = result.status ?? 1;
}

try { main(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
