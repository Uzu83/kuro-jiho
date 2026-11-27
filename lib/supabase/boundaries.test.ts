import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getPublicSupabaseEnv } from "./public-env";
import { createServiceClient } from "./service";

const root = path.resolve(import.meta.dirname, "../..");
const serviceRoleEnvName = ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_");
const serviceFile = path.join(root, "lib/supabase/service.ts");

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    if (
      entry === "node_modules" ||
      entry === ".next" ||
      entry === ".git" ||
      entry === "coverage"
    ) {
      continue;
    }

    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...listSourceFiles(fullPath));
      continue;
    }

    if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry)) {
      files.push(fullPath);
    }
  }

  return files;
}

describe("supabase client boundaries", () => {
  it("reads the service role key only from the server-only module", () => {
    const serviceSource = readFileSync(serviceFile, "utf8");

    expect(serviceSource).toMatch(/import ["']server-only["']/);
    expect(serviceSource).toContain(serviceRoleEnvName);
    expect(serviceSource).toContain("persistSession: false");

    const browserSource = readFileSync(
      path.join(root, "lib/supabase/client.ts"),
      "utf8",
    );
    expect(browserSource).not.toContain(serviceRoleEnvName);
    expect(browserSource).not.toContain("server-only");

    const offenders = listSourceFiles(root)
      .filter((file) => path.resolve(file) !== path.resolve(serviceFile))
      .filter((file) => readFileSync(file, "utf8").includes(serviceRoleEnvName))
      .map((file) => path.relative(root, file));

    expect(offenders).toEqual([]);
  });

  it("does not include invalid public env values in the error", () => {
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "not a url";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-anon-placeholder";

    try {
      expect(() => getPublicSupabaseEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
      try {
        getPublicSupabaseEnv();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).not.toContain("not a url");
        expect(message).not.toContain("public-anon-placeholder");
      }
    } finally {
      restoreEnv("NEXT_PUBLIC_SUPABASE_URL", previousUrl);
      restoreEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", previousAnonKey);
    }
  });

  it("does not include the service role key in the error", () => {
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousServiceKey = process.env[serviceRoleEnvName];
    const sentinel = "sentinel-service-role-value";

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    delete process.env[serviceRoleEnvName];

    try {
      expect(() => createServiceClient()).toThrow(new RegExp(serviceRoleEnvName));
      process.env[serviceRoleEnvName] = sentinel;
      process.env.NEXT_PUBLIC_SUPABASE_URL = "not-a-url";

      try {
        createServiceClient();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).not.toContain(sentinel);
      }
    } finally {
      restoreEnv("NEXT_PUBLIC_SUPABASE_URL", previousUrl);
      restoreEnv(serviceRoleEnvName, previousServiceKey);
    }
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
