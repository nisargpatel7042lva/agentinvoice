import Link from "next/link";

export function EmptyState({ message, action }: { message: string; action?: { label: string; href: string } }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-muted">
      <p>{message}</p>
      {action && (
        <Link href={action.href} className="mt-4 inline-block rounded-md bg-accent px-4 py-2 font-medium text-white hover:bg-accent-hover">
          {action.label}
        </Link>
      )}
    </div>
  );
}
