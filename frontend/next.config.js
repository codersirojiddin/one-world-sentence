/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true, // static export cannot use the Next.js Image Optimization API
  },
  // The Go binary serves the app from "/", so no basePath/assetPrefix is needed.
};

module.exports = nextConfig;
