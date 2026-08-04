import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import IconifyLoader from "@/components/IconifyLoader";
import { site } from "@/data/site";
import "./globals.css";

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
  variable: "--font-figtree",
});

export const metadata: Metadata = {
  metadataBase: new URL(`https://${site.domain}`),
  title: "Take More — Refurbished Catering Equipment, Cape Town",
  description:
    "Commercial catering equipment bought at auction, rebuilt in our Cape Town workshop and sold at 40–60% off retail. Every unit tested, graded and covered by a 6-month warranty.",
  openGraph: {
    title: "Take More — Refurbished Catering Equipment, Cape Town",
    description:
      "Restaurant-grade kit at half the retail price. Stripped, serviced, load-tested and warrantied.",
    locale: "en_ZA",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-ZA" className={`dark ${figtree.variable}`}>
      <body className="bg-background text-foreground antialiased selection:bg-accent selection:text-black">
        <IconifyLoader />
        {children}
      </body>
    </html>
  );
}
