import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    // Proxy same-origin hacia la API en dev: evita CORS y mantiene la
    // cookie httpOnly del refresh como first-party del frontend.
    const target = process.env.API_PROXY_TARGET ?? "http://localhost:4000";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${target}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
