import Link from "next/link";
import type { Session } from "@/lib/supabase";
import { canManageTeam, canSeeCosts, ROLE_LABELS } from "@takemore/core";
import ConnectionBanner from "./ConnectionBanner";
import GlobalSearch from "./GlobalSearch";
import NewItemButton from "./NewItemButton";
import SignOutButton from "./SignOutButton";

/**
 * The app frame.
 *
 * Bottom navigation on a phone and a left rail on a desk, because the primary
 * device here is a phone held one-handed in a warehouse — a top nav puts every
 * destination at the far end of a thumb's reach.
 *
 * Navigation is role-aware, but only as a courtesy: RLS refuses the underlying
 * data regardless, so hiding a link is about not offering someone a door that
 * opens onto an error.
 */

type NavItem = { href: string; label: string; icon: string; badge?: number };

const navFor = (
  role: Session["role"],
  pendingCount: number,
  queuedCount: number
): NavItem[] => [
  { href: "/", label: "Today", icon: "solar:home-2-linear" },
  { href: "/items", label: "Stock", icon: "solar:box-linear" },
  { href: "/leads", label: "Clients", icon: "solar:users-group-two-rounded-linear" },
  {
    href: "/outreach",
    label: "Outreach",
    icon: "solar:magic-stick-3-linear",
    // Suggestions the matcher found and nobody has acted on. Unlike the access
    // badge this is not somebody standing still — but a machine somebody has
    // been waiting months for goes stale in days, so it earns the interruption.
    badge: queuedCount,
  },
  { href: "/board", label: "Board", icon: "solar:widget-4-linear" },
  ...(canSeeCosts(role)
    ? [{ href: "/money", label: "Money", icon: "solar:wallet-linear" }]
    : []),
  ...(canManageTeam(role)
    ? [
        {
          href: "/team",
          label: "Team",
          icon: "solar:users-group-rounded-linear",
          // The only notification in the app, and it earns the place: somebody
          // is standing still, unable to work, until the owner taps this.
          badge: pendingCount,
        },
      ]
    : []),
];

/**
 * The storefront, seen from inside the tool that fills it.
 *
 * Deliberately not in the list above, because that list is also the phone's
 * bottom bar and it is already full — a ninth destination there would shrink
 * every other target under a thumb that has learnt where they are. On a desk
 * it sits with the rest of the rail, where there is room; on a phone it is the
 * globe in the header. Both go to the same in-app page rather than off to the
 * live site, so checking the website never costs you your place in the app.
 */
const WEBSITE: NavItem = {
  href: "/website",
  label: "Website",
  icon: "solar:global-linear",
};

/**
 * The log of who changed what.
 *
 * Desk-only for the same reason as the website link: the bottom bar is already
 * at capacity, and this is something somebody goes looking for when a question
 * has come up — not something they tap while carrying a fryer.
 */
const ACTIVITY: NavItem = {
  href: "/activity",
  label: "Activity",
  icon: "solar:history-linear",
};

/** A count that only exists when it is worth interrupting someone for. */
function Badge({ count, className = "" }: { count?: number; className?: string }) {
  if (!count) return null;
  return (
    <span
      aria-label={`${count} waiting`}
      className={`min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-background text-[10px]
                  font-medium leading-[18px] text-center tabular-nums ${className}`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

export default function Shell({
  staff,
  pendingCount = 0,
  queuedCount = 0,
  children,
}: {
  staff: Session;
  /** Access requests waiting on the owner. Zero for everyone else. */
  pendingCount?: number;
  /** Stock matches waiting for somebody to send or dismiss. */
  queuedCount?: number;
  children: React.ReactNode;
}) {
  const nav = navFor(staff.role, pendingCount, queuedCount);

  return (
    <div className="min-h-dvh flex flex-col md:flex-row">
      {/* Desktop rail.

          Pinned: the rail is one viewport tall and sticks to the top, so a long
          Stock list scrolls past it rather than dragging it off the screen.
          `self-start` is what makes that work at all — the row would otherwise
          stretch the rail to the full height of the page, and a sticky box as
          tall as the thing it scrolls inside has nowhere to stick to.

          The z-index is not decoration. Sticky positioning opens a stacking
          context, which traps the search overlay rendered inside this rail at
          whatever level the rail sits on; below 40 and the connection banner in
          <main> would paint over an open search box. Sitting at 50 keeps the
          overlay on top, while a dialog opened from a page — same level, later
          in the document — still covers the rail as a modal should. */}
      <aside
        className="hidden md:flex md:w-56 lg:w-64 shrink-0 flex-col border-r border-border bg-card/40
                   md:sticky md:top-0 md:z-50 md:h-dvh md:self-start"
      >
        <div className="px-5 py-6">
          <div className="flex items-center space-x-3 mb-1">
            <div className="w-5 h-1 rounded-full bg-accent" />
            <span className="text-accent uppercase text-[11px] tracking-wider">
              Take More
            </span>
          </div>
          <p className="text-sm font-medium tracking-tight">Operations</p>
        </div>

        {/* On a desk the search is a persistent affordance rather than a
            keyboard shortcut somebody has to know about. ⌘K works either way. */}
        <div className="px-3 pb-3 flex justify-start">
          <GlobalSearch />
        </div>

        {/* Now that the rail is capped at a viewport, the destinations are the
            part that gives when there is not enough room — a short laptop window
            scrolls the list rather than pushing New item and the account block
            off the bottom. `min-h-0` is the flexbox tax for letting it. */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-3 space-y-1">
          {[...nav, ACTIVITY, WEBSITE].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-light text-white/70
                         hover:text-white hover:bg-white/5 transition-colors"
            >
              <iconify-icon icon={item.icon} width="18" height="18" noobserver="" />
              {item.label}
              <Badge count={item.badge} className="ml-auto" />
            </Link>
          ))}
        </nav>

        <div className="px-3 pb-4">
          <NewItemButton
            formClassName="mb-4"
            className="w-full flex items-center justify-center gap-2 bg-accent text-background rounded-xl
                       px-4 py-3 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <iconify-icon icon="solar:add-circle-linear" width="18" height="18" noobserver="" />
            New item
          </NewItemButton>

          <div className="border-t border-white/5 pt-4 px-2">
            {/* The name is the way in to your own account — the convention
                everywhere else, and it costs no room in a nav that has none. */}
            <Link href="/account" className="block mb-2 group">
              <p className="text-sm font-light truncate text-white/90 group-hover:text-white transition-colors">
                {staff.fullName}
              </p>
              <p className="text-[11px] text-muted">{ROLE_LABELS[staff.role]}</p>
            </Link>
            <SignOutButton />
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center space-x-2.5">
          <div className="w-4 h-1 rounded-full bg-accent" />
          <span className="text-sm font-medium tracking-tight">Ops</span>
        </div>
        <div className="flex items-center gap-3">
          <GlobalSearch />
          <Link
            href={WEBSITE.href}
            aria-label="View the website"
            className="text-muted active:text-accent transition-colors flex items-center"
          >
            <iconify-icon icon={WEBSITE.icon} width="18" height="18" noobserver="" />
          </Link>
          <Link
            href="/account"
            className="text-[11px] text-muted hover:text-white transition-colors"
          >
            {staff.fullName}
          </Link>
          <SignOutButton compact />
        </div>
      </header>

      {/* pb-24 on mobile keeps the last row clear of the fixed bottom nav. */}
      <main className="flex-1 min-w-0">
        <ConnectionBanner />
        <div className="p-4 md:p-6 pb-24 md:pb-6">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-background/95
                   backdrop-blur-md flex items-stretch"
      >
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="relative flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-light text-white/70
                       active:text-accent transition-colors"
          >
            <iconify-icon icon={item.icon} width="20" height="20" noobserver="" />
            {item.label}
            {/* Pinned to the icon rather than laid out in the row: the bottom
                nav divides the width evenly, so an inline badge would shift
                every other destination under the thumb that already knows
                where they are. */}
            <Badge count={item.badge} className="absolute top-1.5 right-[calc(50%-16px)]" />
          </Link>
        ))}
        <NewItemButton
          formClassName="flex-1 flex"
          className="w-full flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium text-accent"
        >
          <iconify-icon icon="solar:add-circle-linear" width="20" height="20" noobserver="" />
          New
        </NewItemButton>
      </nav>
    </div>
  );
}
