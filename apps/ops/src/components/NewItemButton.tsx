import Link from "next/link";

/** Opening this URL writes nothing; creation requires an audience choice. */
export default function NewItemButton({ className, formClassName = "", children }: {
  className: string; formClassName?: string; children: React.ReactNode;
}) {
  return <div className={formClassName}><Link href="/items/new" className={className}>{children}</Link></div>;
}
