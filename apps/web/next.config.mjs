/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  // Static export: the whole app runs in the browser, so it hosts free on any static host.
  output: "export",
  basePath,
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
  transpilePackages: ["@prep-cart/catalog", "@prep-cart/nutrition", "@prep-cart/planner"],
  webpack: (config) => {
    // highs ships an Emscripten build that references Node modules it never uses in the browser.
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, crypto: false };
    return config;
  },
};

export default nextConfig;
