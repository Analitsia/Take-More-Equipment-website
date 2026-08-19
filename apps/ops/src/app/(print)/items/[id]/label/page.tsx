import { notFound } from "next/navigation";
import { getItem } from "@/lib/queries";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

/**
 * A label, sized for a machine rather than for a screen.
 *
 * The code is the whole point and everything else is there to confirm you have
 * the right machine when two labels are lying on the same bench. Black on
 * white, no chrome, no colour — a thermal printer has one ink and a laser
 * printer's toner is not free.
 *
 * `@page { margin: 8mm }` and a fixed max width mean this comes out the same on
 * A4 and on a 50 × 25 mm roll fed as a custom paper size: the block is centred
 * on whatever it is given rather than laid out for one of them.
 */
export default async function LabelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  const descriptor = [item.brand, item.model].filter(Boolean).join(" ");

  return (
    <>
      {/*
        Inline rather than in globals.css because it is scoped to this page by
        being on it. A print rule in the shared stylesheet applies to every
        route, and the next person printing a stock list would find its margins
        set by a sticker.
      */}
      <style>{`
        @page { margin: 8mm; }
        @media print {
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print flex items-center justify-between gap-3 border-b border-black/10 px-4 py-3">
        <a
          href={`/items/${item.id}`}
          className="text-xs text-black/50 hover:text-black transition-colors"
        >
          ← Back to the machine
        </a>
        <PrintButton />
      </div>

      <div className="flex flex-col items-center justify-center text-center px-6 py-10">
        {/*
          Not the ItemCode component: that one is a button that copies, and a
          button is a thing that prints as a rectangle around your code.
        */}
        <p className="font-mono tabular-nums tracking-[0.15em] leading-none text-7xl md:text-8xl font-medium">
          {item.sku}
        </p>

        <p className="mt-6 text-lg md:text-xl font-medium max-w-md leading-snug">
          {item.title}
        </p>

        {descriptor && (
          <p className="mt-1 text-sm text-black/60">{descriptor}</p>
        )}

      </div>
    </>
  );
}
