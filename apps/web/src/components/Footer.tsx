import { site } from "@/data/site";

// Footer (Minimal based on design feel)
export default function Footer() {
  return (
    <footer className="py-8 px-6 md:px-12 w-full max-w-[1440px] mx-auto border-t border-border flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-light text-muted">
      <p>
        &copy; {new Date().getFullYear()} {site.legalName}. {site.address}.
      </p>
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
        <span>{site.hours}</span>
        <a href={`mailto:${site.email}`} className="hover:text-white transition-colors">
          {site.email}
        </a>
        <a href="#" className="hover:text-white transition-colors">
          Privacy Policy
        </a>
        <a href="#" className="hover:text-white transition-colors">
          Terms of Service
        </a>
      </div>
    </footer>
  );
}
