import Link from "next/link";
import type { Session } from "@/lib/supabase";
import { canManageTeam, canSeeCosts, ROLE_LABELS } from "@takemore/core";
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

type NavItem = { href: string; label: string; icon: string };

const navFor = (role: Session["role"]): NavItem[] => [
  { href: "/", label: "Today", icon: "solar:home-2-linear" },
  { href: "/items", label: "Stock", icon: "solar:box-linear" },
  { href: "/board", label: "Board", icon: "solar:widget-4-linear" },
  ...(canSeeCosts(role)
    ? [{ href: "/money", label: "Money", icon: "solar:wallet-linear" }]
    : []),
  ...(canManageTeam(role)
    ? [{ href: "/team", label: "Team", icon: "solar:users-group-rounded-linear" }]
    : []),
];

export default function Shell({
  staff,
  children,
}: {
  staff: Session;
  children: React.ReactNode;
}) {
  const nav = navFor(staff.role);

  return (
    <div className="min-h-dvh flex flex-col md:flex-row">
      {/* Desktop rail */}
      <aside className="hidden md:flex md:w-56 lg:w-64 shrink-0 flex-col border-r border-border bg-card/40">
        <div className="px-5 py-6">
          <div className="flex items-center space-x-3 mb-1">
            <div className="w-5 h-1 rounded-full bg-accent" />
            <span className="text-accent uppercase text-[11px] tracking-wider">
              Take More
            </span>
          </div>
          <p className="text-sm font-medium tracking-tight">Operations</p>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-light text-white/70
                         hover:text-white hover:bg-white/5 transition-colors"
            >
              <iconify-icon icon={item.icon} width="18" height="18" noobserver="" />
              {item.label}
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
      <main className="flex-1 min-w-0 p-4 md:p-6 pb-24 md:pb-6">{children}</main>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-background/95
                   backdrop-blur-md flex items-stretch"
      >
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-light text-white/70
                       active:text-accent transition-colors"
          >
            <iconify-icon icon={item.icon} width="20" height="20" noobserver="" />
            {item.label}
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
