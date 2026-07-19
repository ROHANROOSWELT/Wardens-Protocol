"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Control Room" },
  { href: "/vault", label: "Vault Registry" },
  { href: "/court", label: "Challenge Court" },
  { href: "/agents", label: "Agent Network" },
  { href: "/proof", label: "Proof Ledger" },
  { href: "/phase2", label: "Protocol V2 ✦" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-50 flex justify-between items-center px-margin-mobile md:px-margin-desktop py-md bg-background w-full border-b-[4px] border-on-surface shadow-[4px_4px_0px_0px_rgba(27,28,22,1)]">
      <Link href="/" className="flex items-center gap-sm group">
        <span className="bg-primary neo-border-sm neo-shadow-sm p-1 flex items-center justify-center group-hover:rotate-[-6deg] transition-transform">
          <span className="material-symbols-outlined text-white" style={{ fontSize: 26 }}>
            shield_lock
          </span>
        </span>
        <span className="text-headline-md font-black tracking-tighter text-on-surface uppercase">
          Wardens
        </span>
      </Link>
      <nav className="hidden md:flex gap-sm items-center">
        {LINKS.map((l) => {
          const active = path === l.href || (l.href !== "/" && path.startsWith(l.href));
          return (
            <Link
              key={l.href}
              href={l.href}
              className={
                active
                  ? "bg-on-surface text-background text-label-md uppercase px-xs py-1 neo-border-sm shadow-[3px_3px_0px_0px_#2FD98A]"
                  : "link-sweep text-on-surface text-label-md uppercase px-xs py-1 font-medium"
              }
            >
              {l.label}
            </Link>
          );
        })}
        <span className="hidden lg:flex items-center gap-xs ml-sm bg-surface-container-lowest neo-border-sm px-xs py-1">
          <span className="live-dot rounded-full" />
          <span className="font-mono-plex text-[12px] uppercase tracking-widest">Live</span>
        </span>
      </nav>
    </header>
  );
}
