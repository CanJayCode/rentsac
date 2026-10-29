// One-time import of the owner's Excel workbook.
//   npm run import -- <file.xlsx> --dry-run     (default) print the plan, write nothing
//   npm run import -- <file.xlsx> --apply       write after typing IMPORT
// For the real database load the env file yourself, e.g.
//   node --env-file=.env.local --import tsx --conditions=react-server scripts/import-excel.ts <file> --apply
import { createInterface } from "node:readline/promises";
import ExcelJS from "exceljs";
import { applyPlan, buildPlan, formatReport } from "../lib/importer";
import { getRepo } from "../lib/repo";

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const apply = args.includes("--apply");
  const allowMemory = args.includes("--allow-memory");
  if (!file || (apply && args.includes("--dry-run"))) {
    console.error("Usage: npm run import -- <file.xlsx> [--dry-run | --apply [--allow-memory]]");
    process.exit(2);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const plan = buildPlan(workbook);
  console.log(formatReport(plan));
  if (!apply) return;

  if (process.env.REPO === "memory" && !allowMemory) {
    console.error("Refusing to apply: REPO=memory writes to a throwaway in-memory store. Pass --allow-memory to do it anyway.");
    process.exit(1);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `\nThis writes ${plan.tenants.length} tenants and ${plan.rounds.length} rounds to ${process.env.REPO === "memory" ? "the memory repo" : "the real database"}.\nType IMPORT to continue: `,
  );
  rl.close();
  if (answer !== "IMPORT") {
    console.log("Not confirmed. Nothing was written.");
    process.exit(1);
  }
  const result = await applyPlan(await getRepo(), plan);
  console.log(`Imported ${result.tenants} tenants, ${result.openingCharges} opening charges, ${result.rounds} rounds.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
