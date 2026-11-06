import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export type RuntimeMode = "development" | "production";

export function getDataDirectory(mode: RuntimeMode): string {
  // src/ and dist/ have the same depth. Never depend on the caller's cwd.
  return mode === "development"
    ? fileURLToPath(new URL("../../../.deploy-crab/", import.meta.url))
    : join(homedir(), ".deploy-crab");
}

export async function prepareDataDirectory(mode: RuntimeMode): Promise<string> {
  const directory = getDataDirectory(mode);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return directory;
}
