import { requireStaff } from "@/lib/supabase";
import NewItemForm from "./NewItemForm";

export default async function NewItemPage() {
  await requireStaff();
  return <NewItemForm />;
}
