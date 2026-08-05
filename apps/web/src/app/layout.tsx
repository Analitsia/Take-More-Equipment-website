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
    "Commercial catering equipment rebuilt in our Cape Town workshop and priced 40–60% below new. Every unit load-tested, graded, photographed and covered by a written 6-month parts-and-labour warranty.",
  openGraph: {
    title: "Take More — Refurbished Catering Equipment, Cape Town",
    description:
      "Restaurant-grade kit at half the retail price. Rebuilt, load-tested, priced on the page and warrantied for six months.",
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
