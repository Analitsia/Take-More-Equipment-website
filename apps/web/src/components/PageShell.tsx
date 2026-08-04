import Link from "next/link";
import Navbar from "./Navbar";
import Footer from "./Footer";
import Subheading from "./Subheading";

export type Crumb = { label: string; href?: string };

/**
 * Wrapper for every page that is not the homepage: pinned navbar, a hero band
 * in the same type scale as the section headings, then content, then footer.
 */
export default function PageShell({
  eyebrow,
  title,
  intro,
  crumbs = [],
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  intro?: React.ReactNode;
  crumbs?: Crumb[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar variant="solid" />

      <header className="w-full max-w-[1440px] mx-auto px-6 md:px-12 pt-6 pb-10 md:pt-20 md:pb-24">
        {crumbs.length > 0 && <Breadcrumbs crumbs={crumbs} />}
        <Subheading text={eyebrow} />
        <h1 className="text-3xl sm:text-4xl md:text-6xl font-medium tracking-tighter leading-[1.15] max-w-4xl">
          {title}
        </h1>
        {intro && (
          <p className="text-muted font-light text-sm md:text-base leading-relaxed max-w-2xl mt-6 md:mt-8">
            {intro}
          </p>
        )}
      </header>

      <main className="flex-1 w-full">{children}</main>

      <Footer />
    </div>
  );
}

export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center flex-wrap gap-2 text-xs font-light text-muted mb-6 md:mb-8"
    >
      {crumbs.map((crumb, idx) => (
        <span key={idx} className="flex items-center gap-2">
          {idx > 0 && <span className="text-white/20">/</span>}
          {crumb.href ? (
            <Link href={crumb.href} className="hover:text-white transition-colors">
              {crumb.label}
            </Link>
          ) : (
            <span className="text-white/70">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
