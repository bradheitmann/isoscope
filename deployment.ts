import { DB_DEFAULT } from "./lib.ts";

export type DeploymentProfile = "full" | "read-only";

/** Validate at runtime too: JavaScript callers and CLI input are not type checked. */
export function deploymentProfile(value: unknown = "full"): DeploymentProfile {
  if (value !== "full" && value !== "read-only")
    throw new Error("profile must be full or read-only");
  return value;
}

/** Parse options before opening a database or starting any service. */
export function parseServeOptions(args: readonly string[]) {
  let dbPath: string | undefined;
  let port = 4177;
  let profile: DeploymentProfile = "full";
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (argument === "--port" || argument === "--profile") {
      if (seen.has(argument)) throw new Error(`duplicate option: ${argument}`);
      seen.add(argument);
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      if (argument === "--profile") profile = deploymentProfile(value);
      else {
        if (!/^\d+$/.test(value) || !Number.isInteger(Number(value)) || Number(value) > 65535)
          throw new Error("port must be an integer from 0 to 65535");
        port = Number(value);
      }
    } else if (argument.startsWith("--")) throw new Error(`unknown serve option: ${argument}`);
    else {
      if (dbPath !== undefined) throw new Error("serve accepts one database path");
      dbPath = argument;
    }
  }
  return { dbPath: dbPath ?? DB_DEFAULT, port, profile };
}
