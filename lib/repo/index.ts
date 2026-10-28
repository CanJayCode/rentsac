import { createMemoryRepo } from "./memory";
import type { Repo } from "./types";

const g = globalThis as { __rentsacMemoryRepo?: Repo };

export async function getRepo(): Promise<Repo> {
  if (process.env.REPO === "memory") {
    g.__rentsacMemoryRepo ??= createMemoryRepo();
    return g.__rentsacMemoryRepo;
  }
  // wired in Task 6
  throw new Error("Supabase repo is wired in Task 6");
}
