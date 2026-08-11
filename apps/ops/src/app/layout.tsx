import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import IconifyLoader from "@/components/IconifyLoader";
import "./globals.css";

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
  variable: "--font-figtree",
});

/**
 * Warm the connection to Supabase before anything needs it.
 *
 * The first thumbnail, the first search keystroke and the first realtime
 * frame all pay DNS + TCP + TLS to this host mid-interaction unless the
 * browser has already opened it. Two variants because browsers key
 * connections by credentials mode: the bare one serves <img> loads, the
 * crossorigin one serves the supabase-js fetch() calls.
 */
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return null;
  }
})();

export const metadata: Metadata = {
  title: "Take More Ops",
  description: "Stock intake, workshop and publishing for Take More Equipment.",
  // A tool, not a page. Nothing here should ever be indexed or previewed.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#080805",
  // Mobile-first: this is used one-handed in a warehouse.
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" className={`dark ${figtree.variable}`}>
      <body className="bg-background text-foreground antialiased selection:bg-accent selection:text-black">
        {supabaseOrigin && (
          <>
            <link rel="preconnect" href={supabaseOrigin} />
            <link rel="preconnect" href={supabaseOrigin} crossOrigin="anonymous" />
          </>
        )}
        <IconifyLoader />
        {children}
      </body>
    </html>
  );
}
