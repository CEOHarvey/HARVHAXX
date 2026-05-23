/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use WASM SWC if native win32 binary fails (see failed-loading-swc)
  experimental: {
    swcPlugins: [],
  },
};

module.exports = nextConfig;
