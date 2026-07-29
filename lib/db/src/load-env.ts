import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

const candidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", ".env"),
  path.resolve(process.cwd(), "..", "..", ".env"),
];

const envPath = candidates.find((candidate) => existsSync(candidate));

if (envPath) {
  config({ path: envPath, override: true });
}
