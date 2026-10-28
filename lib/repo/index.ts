import { createMemoryRepo } from "./memory";
import type { Repo } from "./types";

const g = globalThis as { __rentsacMemoryRepo?: Repo; __rentsacSupabaseRepo?: Repo };

export async function getRepo(): Promise<Repo> {
  if (process.env.REPO === "memory") {
    g.__rentsacMemoryRepo ??= createMemoryRepo();
    return g.__rentsacMemoryRepo;
  }
  if (!g.__rentsacSupabaseRepo) {
    const { createSupabaseRepo } = await import("./supabase");
    g.__rentsacSupabaseRepo = createSupabaseRepo();
  }
  return g.__rentsacSupabaseRepo;
}
