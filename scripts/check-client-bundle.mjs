import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const staticDir = path.join(process.cwd(), ".next", "static");
const patterns = [
  ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_"),
  ...process.argv.slice(2),
];

function walk(dir) {
  const files = [];

  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

if (!statSync(staticDir, { throwIfNoEntry: false })) {
  console.error(".next/static がありません。先に npm run build を実行してください。");
  process.exit(1);
}

const files = walk(staticDir);
const hits = [];

for (const file of files) {
  const text = readFileSync(file);
  for (const pattern of patterns) {
    if (text.includes(pattern)) {
      hits.push(`${path.relative(process.cwd(), file)}: ${pattern}`);
    }
  }
}

if (hits.length > 0) {
  console.error("クライアントバンドルにサービスロールの参照があります。");
  console.error(hits.join("\n"));
  process.exit(1);
}

console.log(
  `client bundle ok (${files.length} files, ${patterns.length} patterns)`,
);
