const args = process.argv.slice(2);
const role = args[0] ?? "api";

if (args.length > 1 || (role !== "api" && role !== "worker")) {
  console.error("Unsupported arguments. Usage: exposurenexus [api|worker]");
  process.exitCode = 1;
} else {
  // Load configuration only for the selected role, in this same process.
  await import(new URL(`../apps/${role}/dist/src/index.js`, import.meta.url));
}
