import { runContract } from "./contract";
import { createMemoryRepo } from "./memory";

runContract("memory", () => createMemoryRepo());
