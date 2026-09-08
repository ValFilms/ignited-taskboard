import { Releases } from "../lib/releases";

async function main() {
  const [command = "history", ...args] = process.argv.slice(2);
  const releases = new Releases(process.cwd());
  let result: unknown;
  if (command === "stage") {
    const title = args.filter(arg => !arg.startsWith("--")).join(" ") || "App changes";
    if (args.some(arg => arg.startsWith("--") && !["--current", "--new"].includes(arg))) throw new Error("Unknown stage option.");
    result = releases.stage(title, args.includes("--current"), args.includes("--new"));
  } else if (command === "candidate" && args.length === 0) result = releases.candidate();
  else if (command === "restore" && args.length === 1) result = releases.restore(args[0]);
  else if (command === "record" && args.length === 1) result = await releases.record(args[0]);
  else if (command === "history" && args.length === 0) result = await releases.history();
  else throw new Error("Use: versions stage [--current] [--new] <description> | candidate | restore vN | record vN | history");
  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
