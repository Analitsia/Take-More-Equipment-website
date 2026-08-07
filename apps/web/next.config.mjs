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
    remotePatterns: [
      // Real item photography, served through Supabase's image transformer.
      ...(supabaseHost ? [{ protocol: "https", hostname: supabaseHost }] : []),
      // Placeholder stock imagery, local and preview environments only. Real
      // media never comes from here — item_media marks these is_placeholder
      // and CI refuses a production deploy that contains any.
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "i.pravatar.cc" },
    ],
  },
};

export default nextConfig;
