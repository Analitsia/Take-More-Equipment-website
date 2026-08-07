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
        <IconifyLoader />
        {children}
      </body>
    </html>
  );
}
