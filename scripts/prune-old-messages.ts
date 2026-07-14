import { prisma } from "../lib/prisma";

void main();

async function main() {
  const options = parseOptions(process.argv.slice(2));

  if (!options) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const cutoff = new Date(Date.now() - options.days * 24 * 60 * 60 * 1000);

  try {
    const messageCount = await prisma.message.count({
      where: { createdAt: { lt: cutoff } }
    });

    if (!options.execute) {
      console.log(
        `[dry-run] ${messageCount} message(s) older than ${cutoff.toISOString()} would be deleted.`
      );
      console.log("Run again with --execute after verifying a recent backup.");
    } else {
      const result = await prisma.message.deleteMany({
        where: { createdAt: { lt: cutoff } }
      });

      console.log(
        `Deleted ${result.count} message(s) older than ${cutoff.toISOString()}.`
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

function parseOptions(args: string[]) {
  const daysIndex = args.indexOf("--days");
  const days = daysIndex >= 0 ? Number(args[daysIndex + 1]) : Number.NaN;

  if (!Number.isInteger(days) || days <= 0) {
    return null;
  }

  return {
    days,
    execute: args.includes("--execute")
  };
}

function printUsage() {
  console.error(
    "Usage: npm run db:prune-messages -- --days <positive integer> [--execute]"
  );
}
