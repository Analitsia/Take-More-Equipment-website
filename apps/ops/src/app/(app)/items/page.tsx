import { listItems } from "@/lib/queries";
import NewItemButton from "@/components/NewItemButton";
import ItemsBrowser from "./ItemsBrowser";

export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  const items = await listItems();

  return (
    /* No width cap here, unlike the other pages. Stock is a four-column board,
       and 6xl is narrower than the four columns want — capping it hid the Sold
       column behind a horizontal scrollbar that `hide-scrollbar` then made
       invisible, so the last column simply looked amputated. The shell's own
       padding is the margin; the board runs the width of the screen inside it. */
    <div>
      <header className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-medium tracking-tight">Stock</h1>
          <p className="text-sm font-light text-muted mt-1">
            {items.length === 0
              ? "Nothing yet."
              : `${items.length} unit${items.length === 1 ? "" : "s"}, newest first.`}
          </p>
        </div>
        <NewItemButton
          formClassName="hidden md:block shrink-0"
          className="inline-flex items-center gap-2 bg-accent text-background rounded-xl
                     px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <iconify-icon icon="solar:add-circle-linear" width="18" height="18" noobserver="" />
          New item
        </NewItemButton>
      </header>

      {items.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center max-w-2xl">
          <div className="w-12 h-12 rounded-2xl bg-background border border-border flex items-center justify-center text-accent mx-auto mb-4">
            <iconify-icon icon="solar:box-linear" width="22" height="22" noobserver="" />
          </div>
          <h2 className="text-base font-medium tracking-tight mb-1">No stock yet</h2>
          <p className="text-sm font-light text-muted max-w-sm mx-auto mb-5">
            Photograph a machine, price it and publish it. It appears on the
            website within seconds.
          </p>
          <NewItemButton className="inline-flex items-center gap-2 bg-accent text-background rounded-xl px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity">
            Take in the first item
          </NewItemButton>
        </div>
      ) : (
        <ItemsBrowser items={items} />
      )}
    </div>
  );
}
