"use client";

import { useState } from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import BrandLogo from "@/components/brand-logo";

const LINKS = [
  { label: "How it works", href: "#how" },
  { label: "Destinations", href: "#destinations" },
  { label: "Trips", href: "#chat" },
  { label: "Pricing", href: "#pricing" },
  { label: "Resources", href: "#resources" },
];

type NavProps = {
  /** "light" = white text over the hero art · "dark" = ink text on paper (chat page). */
  tone?: "light" | "dark";
  /** Anchor prefix so "#how" still resolves from another route ("/#how"). */
  prefix?: string;
  cta?: { label: string; href: string };
};

export default function Nav({
  tone = "light",
  prefix = "",
  cta = { label: "Plan a trip", href: "/chat" },
}: NavProps) {
  const [open, setOpen] = useState(false);
  const light = tone === "light";

  /* class sets ---------------------------------------------------- */
  const shell = light
    ? "relative z-30 w-full"
    : "sticky top-0 z-40 w-full border-b border-line-card bg-paper/85 backdrop-blur-md";
  const brand = light
    ? "text-white/95 transition-opacity hover:opacity-80"
    : "text-ink transition-opacity hover:opacity-80";
  const link = light
    ? "rounded-full px-3.5 py-2 text-[15px] text-white/85 transition-colors hover:bg-white/12 hover:text-white"
    : "rounded-full px-3.5 py-2 text-[15px] text-ink/70 transition-colors hover:bg-ink/6 hover:text-ink";
  const ctaCls = light
    ? "hidden rounded-full bg-white px-5 py-2.5 text-[15px] font-medium text-[#202020] shadow-[0_2px_10px_rgba(2,105,150,0.22)] transition-transform duration-200 hover:-translate-y-px sm:inline-flex"
    : "hidden rounded-full bg-brand-deep px-5 py-2.5 text-[15px] font-medium text-white shadow-[0_2px_10px_rgba(2,80,130,0.2)] transition-transform duration-200 hover:-translate-y-px sm:inline-flex";
  const burger = light
    ? "inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/35 bg-white/12 text-white backdrop-blur-sm transition-colors hover:bg-white/20 lg:hidden"
    : "inline-flex h-10 w-10 items-center justify-center rounded-full border border-line-card bg-white text-ink transition-colors hover:bg-paper lg:hidden";
  const menu = light
    ? "mx-5 mb-2 rounded-2xl border border-white/25 bg-[#1c6cb4]/92 p-2 shadow-[0_18px_40px_-16px_rgba(2,60,100,0.6)] backdrop-blur-md lg:hidden"
    : "mx-5 mb-2 rounded-2xl border border-line-card bg-white p-2 shadow-[0_18px_40px_-18px_rgba(38,35,35,0.35)] lg:hidden";
  const menuLink = light
    ? "block rounded-xl px-3.5 py-3 text-[15px] text-white/90 transition-colors hover:bg-white/12"
    : "block rounded-xl px-3.5 py-3 text-[15px] text-ink/75 transition-colors hover:bg-paper hover:text-ink";
  const menuCta = light
    ? "mt-1 block rounded-xl bg-white px-3.5 py-3 text-[15px] font-medium text-[#202020]"
    : "mt-1 block rounded-xl bg-brand-deep px-3.5 py-3 text-[15px] font-medium text-white";

  /* routes and cross-page anchors use next/link; a plain hash on the
     home page stays a plain anchor so nothing reloads ---------------- */
  const isRoute = (target: string) => target.startsWith("/");
  const render = (target: string, className: string, children: ReactNode) => {
    if (isRoute(target) || prefix) {
      const to = isRoute(target) ? target : `${prefix}${target}`;
      return (
        <Link href={to} className={className} onClick={() => setOpen(false)}>
          {children}
        </Link>
      );
    }
    return (
      <a href={target} className={className} onClick={() => setOpen(false)}>
        {children}
      </a>
    );
  };

  return (
    <header className={shell}>
      <nav className="mx-auto flex w-full max-w-[1440px] items-center gap-4 px-5 py-5 sm:px-8 lg:px-12">
        {render(prefix ? "/" : "#top", `flex items-center gap-2.5 ${brand}`, (
          <>
            <BrandLogo height={24} />
            <span className="text-[19px] leading-none font-medium tracking-[-0.2px]">
              Destinify
            </span>
          </>
        ))}

        <ul className="mx-auto hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <li key={l.label}>{render(l.href, link, l.label)}</li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2.5 lg:ml-0">
          {render(cta.href, ctaCls, cta.label)}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className={burger}
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
        <div className={menu}>
          {LINKS.map((l) => (
            <span key={l.label} className="block">
              {render(l.href, menuLink, l.label)}
            </span>
          ))}
          {render(cta.href, menuCta, cta.label)}
        </div>
      )}
    </header>
  );
}
