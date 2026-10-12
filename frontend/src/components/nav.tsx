"use client";

import { useState } from "react";
import BrandLogo from "@/components/brand-logo";

const LINKS = [
  { label: "How it works", href: "#how" },
  { label: "Destinations", href: "#destinations" },
  { label: "Trips", href: "#chat" },
  { label: "Pricing", href: "#pricing" },
  { label: "Resources", href: "#resources" },
];

export default function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="relative z-30 w-full">
      <nav className="mx-auto flex w-full max-w-[1440px] items-center gap-4 px-5 py-5 sm:px-8 lg:px-12">
        <a
          href="#top"
          className="flex items-center gap-2.5 text-white/95 transition-opacity hover:opacity-80"
        >
          <BrandLogo height={24} />
          <span className="text-[19px] leading-none font-medium tracking-[-0.2px]">
            Destinify
          </span>
        </a>

        <ul className="mx-auto hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <li key={l.label}>
              <a
                href={l.href}
                className="rounded-full px-3.5 py-2 text-[15px] text-white/85 transition-colors hover:bg-white/12 hover:text-white"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2.5 lg:ml-0">
          <a
            href="#chat"
            className="hidden rounded-full bg-white px-5 py-2.5 text-[15px] font-medium text-[#202020] shadow-[0_2px_10px_rgba(2,105,150,0.22)] transition-transform duration-200 hover:-translate-y-px sm:inline-flex"
          >
            Plan a trip
          </a>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/35 bg-white/12 text-white backdrop-blur-sm transition-colors hover:bg-white/20 lg:hidden"
          >
            <span className="sr-only">Menu</span>
            <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
              <rect x="0" y="0" width="16" height="2" fill="currentColor" rx="1" />
              <rect x="0" y="5" width="16" height="2" fill="currentColor" rx="1" />
              <rect x="0" y="10" width="16" height="2" fill="currentColor" rx="1" />
            </svg>
          </button>
        </div>
      </nav>

      {open && (
        <div className="mx-5 mb-2 rounded-2xl border border-white/25 bg-[#1c6cb4]/92 p-2 shadow-[0_18px_40px_-16px_rgba(2,60,100,0.6)] backdrop-blur-md lg:hidden">
          {LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3.5 py-3 text-[15px] text-white/90 transition-colors hover:bg-white/12"
            >
              {l.label}
            </a>
          ))}
          <a
            href="#chat"
            onClick={() => setOpen(false)}
            className="mt-1 block rounded-xl bg-white px-3.5 py-3 text-[15px] font-medium text-[#202020]"
          >
            Plan a trip
          </a>
        </div>
      )}
    </header>
  );
}
