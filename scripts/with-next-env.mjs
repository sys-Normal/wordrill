import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
const require = createRequire(import.meta.url);
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error("Usage: node scripts/with-next-env.mjs <command> [...args]");
  process.exit(1);
}

const executable = command === "prisma" ? process.execPath : command;
const commandArgs = command === "prisma"
  ? [require.resolve("prisma/build/index.js"), ...args]
  : args;

const child = spawn(executable, commandArgs, {
  env: process.env,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
