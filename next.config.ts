import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.18.132"],
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
