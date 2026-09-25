import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
    // The app imports the benchmark's shared data and markup from bench/scenario/,
    // two folders up. Turbopack resolves nothing outside its root, so the root is
    // bench/ (Next.js uses the same folder for output file tracing).
    turbopack: {
        root: fileURLToPath(new URL('../..', import.meta.url)),
    },
};

export default nextConfig;
