import { listItems } from "@/lib/queries";
import { requireStaff } from "@/lib/supabase";
import Board from "./Board";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  // One round of queries, not two: RLS guards the list on its own, and the
  // redirect out of requireStaff() still fires before anything renders.
  const [staff, items] = await Promise.all([requireStaff(), listItems()]);

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-xl md:text-2xl font-medium tracking-tight">Board</h1>
        <p className="text-sm font-light text-muted mt-1">
          Every machine, by where it is in the workshop.
        </p>
      </header>
      <Board items={items} role={staff.role} />
    </div>
  );
}
