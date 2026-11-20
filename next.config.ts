import type { NextConfig } from "next";
const config: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/speak", destination: "/read-along/index.html" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};
export default config;
