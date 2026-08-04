import type { Block } from "@/data/posts";

/** Shared long-form typography, tuned to the section headings on the homepage. */
export function Prose({ blocks }: { blocks: Block[] }) {
  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {blocks.map((block, idx) => {
        switch (block.kind) {
          case "h":
            return (
              <h2
                key={idx}
                className="text-xl sm:text-2xl md:text-3xl font-medium tracking-tight mt-8 first:mt-0"
              >
                {block.text}
              </h2>
            );
          case "list":
            return (
              <ul key={idx} className="flex flex-col gap-3">
                {block.items.map((point) => (
                  <li key={point} className="flex items-start gap-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-2.5"></span>
                    <span className="text-muted font-light text-sm md:text-base leading-relaxed">
                      {point}
                    </span>
                  </li>
                ))}
              </ul>
            );
          case "quote":
            return (
              <blockquote
                key={idx}
                className="border-l border-accent/50 pl-6 my-2 text-lg md:text-xl font-light tracking-tight text-white/90 leading-relaxed"
              >
                {block.text}
              </blockquote>
            );
          default:
            return (
              <p
                key={idx}
                className="text-muted font-light text-sm md:text-base leading-relaxed"
              >
                {block.text}
              </p>
            );
        }
      })}
    </div>
  );
}

export function ContentSection({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`w-full max-w-[1440px] mx-auto px-6 md:px-12 pb-14 md:pb-24 ${className}`}
    >
      {children}
    </section>
  );
}
