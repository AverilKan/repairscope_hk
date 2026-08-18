import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The real contractor request bearer secret lives in the URL
        // path itself (see components/contractor/ContractorResponseRoute.tsx
        // — T2 Commit 2). Referrer-Policy: no-referrer stops that URL
        // (and therefore the token) from leaking via the Referer header
        // to any third-party resource this page happens to load.
        source: "/contractor/respond/:token",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
