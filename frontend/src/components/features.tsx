const PARTNERS = [
  "ANA",
  "Japan Airlines",
  "Booking.com",
  "Rakuten Travel",
  "Ryanair",
  "Hyatt",
  "Trainline",
  "Airbnb",
  "Safari Ltd",
  "Lufthansa",
];

const FEATURES = [
  {
    step: "01",
    title: "Researches like a local, not a search box",
    body: "It reads opening hours, seasonality, transit times and reviews — then tells you what's actually worth your morning.",
    tint: "bg-[#1c91ec]/10 text-[#1c6cb4]",
  },
  {
    step: "02",
    title: "Books only when you approve it",
    body: "Fares and rooms are held, never charged. You tap once to confirm, and the agent does the paperwork.",
    tint: "bg-[#34a853]/12 text-[#2c8445]",
  },
  {
    step: "03",
    title: "Re-plans the whole trip in one message",
    body: "Move a date, cut the budget, add a third traveller — the itinerary, holds and totals re-flow instantly.",
    tint: "bg-[#a76451]/12 text-[#8f5342]",
  },
];

function GrassEdge() {
  return (
    <svg
      viewBox="0 0 400 14"
      preserveAspectRatio="none"
      className="block h-[14px] w-full"
      aria-hidden="true"
    >
      {Array.from({ length: 100 }, (_, i) => {
        const h = 4 + ((Math.sin(i * 1.7) + 1) * 4);
        return <rect key={i} x={i * 4} y={14 - h} width="4" height={h} fill="#629959" />;
      })}
      {Array.from({ length: 50 }, (_, i) => {
        const h = 3 + ((Math.cos(i * 2.3) + 1) * 2.5);
        return (
          <rect key={`b${i}`} x={i * 8} y={14 - h} width="4" height={h} fill="#4f8349" />
        );
      })}
    </svg>
  );
}

export default function Features() {
  return (
    <>
      {/* logo cloud ------------------------------------------------ */}
      <div id="destinations" className="border-y border-line-card bg-sunken/60">
        <div className="mx-auto max-w-[1180px] overflow-hidden px-5 py-7 sm:px-8 lg:px-12">
          <p className="mb-5 text-center font-mono text-[10.5px] tracking-[1.4px] text-ink/42 uppercase">
            Connected to 240+ travel suppliers
          </p>
          <div className="relative flex overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
            <div className="animate-drift flex w-max shrink-0 items-center gap-12 pr-12">
              {[...PARTNERS, ...PARTNERS].map((p, i) => (
                <span
                  key={`${p}-${i}`}
                  className="shrink-0 text-[15px] font-medium tracking-[0.2px] whitespace-nowrap text-ink/35"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* feature trio ---------------------------------------------- */}
      <section id="how" className="bg-paper">
        <div className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
          <div className="mb-10 max-w-[560px] lg:mb-14">
            <p className="mb-3 font-mono text-[11px] tracking-[1.4px] text-[#1c6cb4] uppercase">
              How it works
            </p>
            <h2 className="text-[32px] leading-[1.12] font-medium tracking-[-0.5px] text-ink sm:text-[40px] sm:leading-[1.15] sm:tracking-[-0.8px]">
              An agent that does the boring half of travelling
            </h2>
            <p className="mt-4 text-[16px] leading-[1.5] text-ink/62">
              You bring the idea. Destinify brings the twenty tabs you were about
              to open.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {FEATURES.map((f) => (
              <article
                key={f.step}
                className="rounded-[20px] border border-line-card bg-raised p-6 transition-shadow hover:shadow-[0_18px_44px_-30px_rgba(38,35,35,0.5)]"
              >
                <span
                  className={`inline-flex h-9 items-center rounded-[9px] px-2.5 font-mono text-[12px] tracking-[0.5px] ${f.tint}`}
                >
                  {f.step}
                </span>
                <h3 className="mt-5 text-[20px] leading-[1.1] font-medium tracking-[-0.4px] text-ink">
                  {f.title}
                </h3>
                <p className="mt-3 text-[15px] leading-[1.55] text-ink/62">{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* closing CTA ------------------------------------------------ */}
      <section id="pricing" className="relative bg-[linear-gradient(180deg,#1c91ec_0%,#3ba4f2_58%,#7cc7f4_100%)]">
        <div className="mx-auto max-w-[1180px] px-5 pt-20 pb-24 text-center sm:px-8 lg:px-12 lg:pt-28">
          <h2 className="mx-auto max-w-[640px] text-[32px] leading-[1.1] font-medium tracking-[-0.6px] text-white sm:text-[46px] sm:tracking-[-1px]">
            Start with one message. Get a whole trip.
          </h2>
          <p className="mx-auto mt-4 max-w-[460px] text-[16px] leading-[1.5] text-white/78">
            Free to plan. Pay only when you approve a booking.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#chat"
              className="rounded-full bg-white px-6 py-3 text-[16px] font-medium text-[#202020] shadow-[0_4px_16px_rgba(2,80,130,0.3)] transition-transform duration-200 hover:-translate-y-0.5"
            >
              Plan a trip
            </a>
            <a
              href="#how"
              className="rounded-full border border-[#5cccfc] px-6 py-3 text-[16px] font-medium text-white transition-colors duration-200 hover:bg-[#5cccfc]/18"
            >
              See a sample trip
            </a>
          </div>
        </div>
        <GrassEdge />
      </section>
    </>
  );
}
