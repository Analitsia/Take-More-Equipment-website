/** @type {import('next').NextConfig} */
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return undefined;
  }
})();

const nextConfig = {
  // Workspace packages are consumed as TypeScript source — no build step, no
  // dist/ to go stale.
  transpilePackages: ["@takemore/core", "@takemore/db", "@takemore/ui"],
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost }]
      : [],
  },
};

export default nextConfig;
