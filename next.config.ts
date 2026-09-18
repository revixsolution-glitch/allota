import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/telephony/upload-recording/:slug*",
        destination: "/api/telephony/upload-recording",
      },
    ];
  },
};

export default nextConfig;
