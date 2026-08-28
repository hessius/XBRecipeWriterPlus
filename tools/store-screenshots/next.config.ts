import type {NextConfig} from "next";

const nextConfig: NextConfig = {
    // Without this, Turbopack walks up out of `tools/` and picks the Expo app's
    // lockfile as the workspace root, which puts a React Native dependency tree
    // in scope for a plain web build.
    turbopack: {root: __dirname},
    // The dev-mode badge sits in the bottom-left corner and was being baked
    // into every headless export as a stray grey blob.
    devIndicators: false
};

export default nextConfig;
