/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // The service worker must never be served from a cache, or a
        // fix to it would not reach phones that already installed it.
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/staff.webmanifest",
        headers: [{ key: "Content-Type", value: "application/manifest+json" }],
      },
    ];
  },
};

module.exports = nextConfig;
