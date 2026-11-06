"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, BadgeCheck, Loader2, X } from "lucide-react";
import { useAccount, useSignMessage } from "wagmi";
import { loadProfile, mintName, nameClaimMessage } from "@/app/actions";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

const SKIP_KEY = (addr: string) => "ia.nameprompt.skipped." + addr.toLowerCase();
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

type Step = "pick" | "signing" | "done";

/**
 * First thing a new wallet sees: claim a free ENS name under our parent on Sepolia.
 * Opens once per wallet when it has no name yet; "Later" remembers the choice on this device.
 * The backend pays the gas; the user signs one message to prove the wallet is theirs.
 */
export function NameOnboarding() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [open, setOpen] = useState(false);
  const [parent, setParent] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [step, setStep] = useState<Step>("pick");
  const [error, setError] = useState<string | null>(null);
  const [minted, setMinted] = useState<{ name: string; txHash: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isConnected || !address) {
      setOpen(false);
      return;
    }
    let skipped = false;
    try {
      skipped = localStorage.getItem(SKIP_KEY(address)) === "1";
    } catch {
      /* private mode */
    }
    if (skipped) return;
    let stale = false;
    loadProfile(address).then((p) => {
      if (stale || p.name || !p.canMint || p.role !== "seller") return; // only sellers get a wallet name; buyers name their vault
      setParent(p.parent);
      setStep("pick");
      setOpen(true);
    });
    return () => {
      stale = true;
    };
  }, [address, isConnected]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && step !== "signing" && later();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, step]);

  if (!open || !address) return null;

  const clean = label.trim().toLowerCase();
  const valid = LABEL_RE.test(clean);

  function later() {
    try {
      if (address) localStorage.setItem(SKIP_KEY(address), "1");
    } catch {
      /* private mode */
    }
    setOpen(false);
  }

  async function claim() {
    if (!address || !valid) return;
    setError(null);
    setStep("signing");
    try {
      const msg = await nameClaimMessage(clean, address);
      if (!msg.ok || !msg.data) throw new Error(msg.message);
      const signature = await signMessageAsync({ message: msg.data.message });
      const r = await mintName(clean, address, signature);
      if (!r.ok || !r.data) throw new Error(r.message);
      setMinted(r.data);
      setStep("done");
    } catch (e) {
      const m = (e as Error).message ?? "";
      setError(/reject|denied|cancel/i.test(m) ? "You cancelled the signature. Nothing was registered." : m || "Could not register the name.");
      setStep("pick");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center sm:p-6" role="presentation">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={() => step !== "signing" && later()} className="absolute inset-0 bg-[#161513]/55 backdrop-blur-sm" />
      <div role="dialog" aria-modal="true" aria-labelledby="name-title" className="pl-panel pl-sage relative w-full max-w-md p-0 shadow-raised">
        <div className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <p className="font-mono text-[11px] tracking-[0.08em] text-[#161513]/60 uppercase">Step 1 of 1 · Your identity</p>
            {step !== "signing" && (
              <button type="button" aria-label="Close" onClick={later} className="-mt-1 -mr-1 rounded-lg p-1.5 text-[#161513]/60 hover:bg-white/40">
                <X aria-hidden="true" className="size-5" />
              </button>
            )}
          </div>

          {step === "done" && minted ? (
            <>
              <h2 id="name-title" className="pl-title mt-3 text-[34px] leading-[1] font-medium tracking-[-0.04em]">
                You&apos;re <em>{minted.name}</em>
              </h2>
              <p className="mt-3 text-[15px] text-[#161513]/70">Buyers and investors can now look you up by name. It&apos;s registered on Sepolia and owned by your wallet.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a href={"https://sepolia.app.ens.domains/" + minted.name} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-1.5 rounded-[10px] bg-[#161513] px-4 text-sm font-medium text-[#f3f1ec]">
                  See it on ENS <ArrowUpRight aria-hidden="true" className="size-4" />
                </a>
                <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-[10px] px-4 text-sm font-medium hover:bg-white/40">
                  Continue
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 id="name-title" className="pl-title mt-3 text-[34px] leading-[1] font-medium tracking-[-0.04em]">
                Claim your <em>name.</em>
              </h2>
              <p className="mt-3 text-[15px] text-[#161513]/70">
                A free ENS name makes your business easy to find and verify. We pay the gas; you just sign once.
              </p>
              <form
                className="mt-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  void claim();
                }}
              >
                <label htmlFor="name-input" className="text-sm font-medium">
                  Business name
                </label>
                <div className={cn("mt-1.5 flex items-center rounded-xl border bg-white/70 pr-3 focus-within:outline-2 focus-within:outline-[#c2410c]", error ? "border-[#b91c1c]" : "border-white/80")}>
                  <input
                    ref={input}
                    id="name-input"
                    value={label}
                    disabled={step === "signing"}
                    onChange={(e) => setLabel(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="acme-labs"
                    autoComplete="off"
                    maxLength={32}
                    className="h-12 min-w-0 flex-1 bg-transparent px-3 text-base outline-none"
                  />
                  <span className="truncate font-mono text-xs text-[#161513]/55">.{parent}</span>
                </div>
                <p className={cn("mt-2 min-h-5 text-[13px]", error ? "text-[#b91c1c]" : "text-[#161513]/60")}>
                  {error ??
                    (clean && !valid ? "3 to 32 letters, numbers or dashes, not starting or ending with a dash." : clean ? (
                      <span className="inline-flex items-center gap-1">
                        <BadgeCheck aria-hidden="true" className="size-3.5" /> {clean}.{parent}
                      </span>
                    ) : (
                      "Lowercase letters, numbers and dashes."
                    ))}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button type="submit" size="lg" disabled={!valid || step === "signing"} aria-busy={step === "signing"}>
                    {step === "signing" ? (
                      <>
                        <Loader2 aria-hidden="true" className="animate-spin" /> Sign in your wallet…
                      </>
                    ) : (
                      "Claim name"
                    )}
                  </Button>
                  {step !== "signing" && (
                    <button type="button" onClick={later} className="h-12 rounded-[10px] px-4 text-sm font-medium hover:bg-white/40">
                      Later
                    </button>
                  )}
                </div>
                {step === "signing" && <p className="mt-3 text-[13px] text-[#161513]/60">After you sign, registering on Sepolia takes about 25 seconds.</p>}
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
