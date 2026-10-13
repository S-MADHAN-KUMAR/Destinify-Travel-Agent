import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  /* 3D globe + Leaflet are client-only; transpile so Turbopack handles their
     modern ESM cleanly. */
  transpilePackages: [
    "three",
    "@react-three/fiber",
    "@react-three/drei",
    "leaflet",
    "react-leaflet",
  ],
  images: {
    /* The agent pulls real photos from Wikimedia (Wikipedia/Commons), Openverse
       (Flickr/StockSnap) and Yelp. The UI uses <img> with a graceful fallback,
       but these patterns keep next/image usable for the known primary hosts. */
    remotePatterns: [
      { protocol: "https", hostname: "**.wikimedia.org" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "thumb.wikimedia.org" },
      { protocol: "https", hostname: "**.yelpcdn.com" },
      { protocol: "https", hostname: "live.staticflickr.com" },
      { protocol: "https", hostname: "**.staticflickr.com" },
      { protocol: "https", hostname: "cdn.stocksnap.io" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
    dangerouslyAllowLocalIP: false,
  },
};

export default nextConfig;
