"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { loadProfile } from "@/app/actions";
import { buttonVariants, Card } from "@/components/ui";

/** Shows its children to everyone except a wallet that chose the buyer role, which does not sell invoices. */
export function RoleGate({ children }: { children: React.ReactNode }) {
  const { address } = useAccount();
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    if (!address) return setRole(null);
    let stale = false;
    loadProfile(address).then((p) => !stale && setRole(p.role), () => undefined);
    return () => {
      stale = true;
    };
  }, [address]);
  if (role !== "buyer") return <>{children}</>;
  return (
    <Card className="flex flex-col items-start gap-3 p-6">
      <h2 className="text-base font-semibold">This wallet is a buyer</h2>
      <p className="max-w-xl text-sm text-ink-soft">Buyers pay invoices from their vault; they do not sell them. Use another wallet to create invoices as a seller, or manage your agent on your profile.</p>
      <Link href="/profile" className={buttonVariants({ variant: "outline", size: "sm" })}>Open profile</Link>
    </Card>
  );
}
