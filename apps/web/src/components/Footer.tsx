import Link from "next/link";
import { site } from "@/data/site";

// Footer (Minimal based on design feel)
export default function Footer() {
  return (
    <footer className="w-full max-w-[1440px] mx-auto px-6 md:px-12 py-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-light text-muted">
      <p className="text-center md:text-left">
        &copy; {new Date().getFullYear()} {site.legalName}. {site.address}.
      </p>
      <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2">
        <Link href="/#catalogue" className="hover:text-white transition-colors">
          Stock
        </Link>
        <Link href="/conditions" className="hover:text-white transition-colors">
          Condition &amp; Warranty
        </Link>
        <Link href="/delivery" className="hover:text-white transition-colors">
          Delivery
        </Link>
        <Link href="/about" className="hover:text-white transition-colors">
          About
        </Link>
        <Link href="/blog" className="hover:text-white transition-colors">
          Journal
        </Link>
        <a href={`mailto:${site.email}`} className="hover:text-white transition-colors">
          {site.email}
        </a>
      </nav>
    </footer>
  );
}
