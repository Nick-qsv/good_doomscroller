import type { NextConfig } from "next";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: repositoryRoot,
  turbopack: { root: repositoryRoot },
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
