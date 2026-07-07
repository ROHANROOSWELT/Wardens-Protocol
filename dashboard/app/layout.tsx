import "./globals.css";
import type { ReactNode } from "react";
import { Nav } from "../components/Nav";

export const metadata = {
  title: "Wardens Protocol — Live RWA Trust Layer",
  description: "Casper's live trust layer for tokenized RWA credit.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;900&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background text-on-background min-h-screen flex flex-col">
        <Nav />
        <main className="flex-1">{children}</main>
        <footer className="mt-xl border-t-[4px] border-on-surface bg-on-surface text-background">
          <div className="marquee py-xs border-b-2 border-background/20" aria-hidden="true">
            {/* two identical halves so translateX(-50%) loops seamlessly */}
            <div className="marquee-track">
              {[0, 1].map((half) => (
                <div key={half} className="flex shrink-0 font-mono-plex text-[13px] uppercase tracking-[0.25em]">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <span key={j} className="shrink-0 pr-[5rem]">
                      Verify <span className="text-[#2FD98A]">■</span> Score{" "}
                      <span className="text-[#e3dfff]">■</span> Challenge{" "}
                      <span className="text-[#f2c94c]">■</span> Slash{" "}
                      <span className="text-[#ba4a4a]">■</span>{" "}
                      <span className="text-[#2FD98A]">Wardens Protocol on Casper</span>{" "}
                      <span className="text-background/40">◆</span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-between items-center px-margin-mobile md:px-margin-desktop py-xs font-mono-plex text-[12px] uppercase tracking-widest text-background/70">
            <span>Wardens Protocol — Live RWA Trust Layer</span>
            <span className="hidden sm:block">Built on Casper</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
