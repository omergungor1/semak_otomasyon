import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: __dirname,
  },
  images: {
    // Vercel Image Optimization ücretli; ücretsiz planda /_next/image 402 döner.
    // Spaces zaten CDN olduğu için tarayıcı görselleri doğrudan yükler.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "semak.ams3.digitaloceanspaces.com",
      },
      {
        protocol: "https",
        hostname: "www.semak.com.tr",
      },
    ],
  },
};

export default nextConfig;
