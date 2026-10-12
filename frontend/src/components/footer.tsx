import BrandLogo from "@/components/brand-logo";

const COLUMNS: { heading: string; links: string[] }[] = [
  { heading: "Product", links: ["How it works", "Destinations", "Trip agent", "Pricing"] },
  { heading: "Company", links: ["About", "Careers", "Press", "Contact"] },
  { heading: "Resources", links: ["Docs", "Support", "Changelog", "Status"] },
  { heading: "Legal", links: ["Privacy", "Terms", "Cookies", "Security"] },
];

export default function Footer() {
  return (
    <footer id="resources" className="border-t border-line-card bg-paper">
      <div className="mx-auto max-w-[1180px] px-5 py-14 sm:px-8 lg:px-12 lg:py-16">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))]">
          <div>
            <p className="flex items-center gap-2.5 text-[18px] font-medium tracking-[-0.2px] text-ink">
              <BrandLogo height={22} />
              Destinify
            </p>
            <p className="mt-3 max-w-[260px] text-[14px] leading-[1.5] text-ink/55">
              A trip agent that researches, books and re-plans — while you keep the
              final say.
            </p>
          </div>

          {COLUMNS.map((c) => (
            <div key={c.heading}>
              <p className="font-mono text-[10.5px] tracking-[1.2px] text-ink/42 uppercase">
                {c.heading}
              </p>
              <ul className="mt-3.5 space-y-2.5">
                {c.links.map((l) => (
                  <li key={l}>
                    <a
                      href="#top"
                      className="text-[14px] text-ink/65 transition-colors hover:text-ink"
                    >
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line-card pt-6 sm:flex-row sm:items-center">
          <p className="text-[12.5px] text-ink/45">
            © 2026 Destinify. All rights reserved.
          </p>
          <p className="text-[12.5px] text-ink/45 sm:ml-auto">
            Design reference: Cofounder (via Inspo)
          </p>
        </div>
      </div>
    </footer>
  );
}
