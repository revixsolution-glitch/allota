import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // No dashboard: Lead Center is the admin landing page.
    return [{ source: "/admin", destination: "/admin/leads", permanent: false }];
  },
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
