import { requireStaff } from "@/lib/supabase";

/**
 * Pages that exist to come out of a printer.
 *
 * Its own route group rather than a corner of (app), because the alternative
 * was hiding the Shell with a print stylesheet — and a rule broad enough to
 * hide a sticky sidebar is broad enough to quietly break printing on every
 * other page in the app. A layout that never renders a sidebar cannot.
 *
 * It still calls requireStaff(). A route group is a folder, not a boundary, and
 * a printable page that skipped the check would be an unauthenticated view of
 * stock reachable by guessing a UUID.
 */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await requireStaff();

  return (
    // The app is dark; paper is not. This forces the light ground for both the
    // screen preview and the printer, rather than trusting a print stylesheet
    // to undo a dark theme the browser may decide to honour anyway.
    <div className="min-h-dvh bg-white text-black">{children}</div>
  );
}
