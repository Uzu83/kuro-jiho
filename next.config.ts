import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // create-next-app の --no-agents-md に合わせ、next dev が AGENTS.md を足さない。
  agentRules: false,
};

export default nextConfig;
