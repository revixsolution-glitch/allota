import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@whiskeysockets/baileys", "jimp"],
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
