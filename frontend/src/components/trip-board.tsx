"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

import { SmartImage } from "@/components/smart-image";
import type { Hotel, MapPin, Place, Restaurant, TransportOption, TripPlan } from "@/lib/trip-types";

/* Heavy visuals (WebGL globe + Leaflet) load client-only. */
const Globe3D = dynamic(() => import("@/components/globe-3d"), {
  ssr: false,
  loading: () => <PanelSkeleton label="Loading globe…" />,
});
const CityMap = dynamic(() => import("@/components/city-map"), {
  ssr: false,
  loading: () => <PanelSkeleton label="Loading map…" />,
});

const inr = (n: number) => `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n)}`;

function durationLabel(min?: number | null): string | null {
  if (!min || min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function PanelSkeleton({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[180px] w-full items-center justify-center rounded-[16px] bg-gradient-to-br from-[#0c2440] to-[#123a5e] text-[12.5px] text-white/60">
      {label}
    </div>
  );
}

function SectionTitle({ kicker, title, count }: { kicker: string; title: string; count?: number }) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <div>
        <p className="font-mono text-[10.5px] tracking-[1.2px] text-[#1c6cb4] uppercase">{kicker}</p>
        <h3 className="mt-1 text-[19px] leading-tight font-medium tracking-[-0.3px] text-ink">
          {title}
        </h3>
      </div>
      {count != null && (
        <span className="ml-auto rounded-full border border-line-pill bg-white px-2.5 py-1 font-mono text-[10.5px] text-ink/55">
          {count}
        </span>
      )}
    </div>
  );
}

/* ------------------------------- itinerary ------------------------------- */

const SLOT_META: Record<string, { icon: string; label: string }> = {
  morning: { icon: "🌅", label: "Morning" },
  afternoon: { icon: "☀️", label: "Afternoon" },
  evening: { icon: "🌆", label: "Evening" },
};

function ItineraryDay({ plan, day }: { plan: TripPlan; day: number }) {
  const d = plan.itinerary.find((x) => x.day === day);
  if (!d) return null;
  return (
    <div className="space-y-3">
      <div className="rounded-[14px] border border-line-card bg-white p-3.5">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#1c6cb4] px-2.5 py-1 font-mono text-[10.5px] tracking-[0.5px] text-white uppercase">
            Day {d.day}
          </span>
          {d.date && <span className="font-mono text-[11px] text-ink/50">{d.date}</span>}
          <span className="ml-auto text-[12px] font-medium text-[#1c6cb4]">{d.theme}</span>
        </div>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink/70">{d.summary}</p>
      </div>

      <ol className="relative space-y-3 pl-4">
        <span className="absolute top-2 bottom-2 left-[7px] w-[2px] bg-line-pill" aria-hidden="true" />
        {d.activities.map((a, i) => (
          <li key={`${a.slot}-${i}`} className="group relative">
            <span
              className="absolute top-3.5 -left-4 h-3.5 w-3.5 rounded-full border-2 border-white shadow"
              style={{ background: i === 0 ? "#1c91ec" : "#c9cfc7" }}
              aria-hidden="true"
            />
            <div className="flex gap-3 rounded-[14px] border border-line-card bg-white p-3">
              <div className="w-24 shrink-0 overflow-hidden rounded-[10px]">
                <SmartImage src={a.image_url} alt={a.title} icon={SLOT_META[a.slot]?.icon} aspect="aspect-square" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] tracking-[0.5px] text-ink/45 uppercase">
                    {SLOT_META[a.slot]?.label ?? a.slot}
                  </span>
                  {a.duration_hours != null && (
                    <span className="text-[10.5px] text-ink/40">· ~{a.duration_hours}h</span>
                  )}
                </div>
                <p className="mt-0.5 text-[14px] leading-snug font-medium text-ink">{a.title}</p>
                {a.description && (
                  <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-ink/55">{a.description}</p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="grid gap-2 sm:grid-cols-3">
        {[
          ["🍽️ Lunch", d.meals.lunch],
          ["🍜 Dinner", d.meals.dinner],
          ["🏨 Stay", d.stay],
        ].map(([k, v]) =>
          v ? (
            <div key={k as string} className="rounded-[12px] border border-line-card bg-white px-3 py-2.5">
              <p className="font-mono text-[10px] tracking-[0.5px] text-ink/45 uppercase">{k}</p>
              <p className="mt-0.5 truncate text-[12.5px] font-medium text-ink">{v}</p>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

/* ------------------------------ explore cards ----------------------------- */

function PlaceGrid({ items }: { items: Place[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((p) => (
        <article key={p.name} className="group overflow-hidden rounded-[14px] border border-line-card bg-white">
          <SmartImage src={p.image_url} alt={p.name} icon="📍" />
          <div className="p-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-paper px-2 py-0.5 font-mono text-[9.5px] tracking-[0.5px] text-ink/55 uppercase">
                {p.category}
              </span>
              {p.price_level && <span className="text-[11px] text-ink/50">{p.price_level}</span>}
            </div>
            <p className="mt-1.5 text-[14px] leading-snug font-medium text-ink">{p.name}</p>
            {p.description && (
              <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-ink/55">{p.description}</p>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function RestaurantGrid({ items }: { items: Restaurant[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((r) => (
        <article key={r.name} className="group overflow-hidden rounded-[14px] border border-line-card bg-white">
          <SmartImage src={r.image_url} alt={r.name} icon="🍽️" />
          <div className="p-3">
            <div className="flex items-center gap-2">
              {r.cuisine && (
                <span className="rounded-full bg-paper px-2 py-0.5 font-mono text-[9.5px] tracking-[0.5px] text-ink/55 uppercase">
                  {r.cuisine}
                </span>
              )}
              {r.price_level && <span className="text-[11px] text-ink/50">{r.price_level}</span>}
              {r.rating != null && <span className="ml-auto text-[11.5px] font-medium text-[#a76451]">★ {r.rating}</span>}
            </div>
            <p className="mt-1.5 text-[14px] leading-snug font-medium text-ink">{r.name}</p>
            {r.description && <p className="mt-1 line-clamp-2 text-[12px] text-ink/55">{r.description}</p>}
          </div>
        </article>
      ))}
    </div>
  );
}

function HotelGrid({ items }: { items: Hotel[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((h) => (
        <article key={h.name} className="group overflow-hidden rounded-[14px] border border-line-card bg-white">
          <SmartImage src={h.image_url} alt={h.name} icon="🏨" />
          <div className="p-3">
            <div className="flex items-center gap-2">
              {h.amenities.slice(0, 2).map((a) => (
                <span key={a} className="rounded-full bg-paper px-2 py-0.5 font-mono text-[9.5px] text-ink/55 uppercase">
                  {a}
                </span>
              ))}
              {h.rating != null && <span className="ml-auto text-[11.5px] font-medium text-[#34a853]">★ {h.rating}</span>}
            </div>
            <p className="mt-1.5 text-[14px] leading-snug font-medium text-ink">{h.name}</p>
            <div className="mt-1 flex items-center gap-2">
              {h.price_inr != null && (
                <span className="text-[12.5px] font-medium text-[#1c6cb4]">{inr(h.price_inr)} / night</span>
              )}
              {h.description && <span className="truncate text-[11.5px] text-ink/50">{h.description}</span>}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

const MODE_DOT: Record<string, string> = {
  flight: "#1c6cb4",
  train: "#1c91ec",
  bus: "#a76451",
  cab: "#34a853",
  metro: "#629959",
  walk: "#c9cfc7",
};

function TransportList({ items }: { items: TransportOption[] }) {
  return (
    <ul className="space-y-2">
      {items.map((t, i) => (
        <li key={`${t.mode}-${i}`} className="flex items-center gap-3 rounded-[14px] border border-line-card bg-white p-3">
          <div className="h-14 w-20 shrink-0 overflow-hidden rounded-[10px]">
            <SmartImage src={t.image_url} alt={t.title} icon={t.mode === "flight" ? "✈️" : t.mode === "train" ? "🚆" : t.mode === "bus" ? "🚌" : "🚕"} aspect="aspect-[4/3]" />
          </div>
          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: MODE_DOT[t.mode] ?? "#c9cfc7" }} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium text-ink">{t.title}</p>
            <p className="truncate text-[11.5px] text-ink/55">
              {[t.provider, durationLabel(t.duration_min), t.departure].filter(Boolean).join(" · ")}
            </p>
            {t.note && <p className="truncate text-[11px] text-ink/45">{t.note}</p>}
          </div>
          <div className="shrink-0 text-right">
            <p className={`text-[13.5px] font-medium tabular-nums ${t.price_inr == null ? "text-ink/45" : "text-[#1c6cb4]"}`}>
              {t.price_inr == null ? "—" : inr(t.price_inr)}
            </p>
            <p className="font-mono text-[10px] text-ink/40 uppercase">{t.source === "estimate" ? "est." : "live"}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------- board --------------------------------- */

const EXPLORE_TABS = ["Itinerary", "Places", "Food", "Stays", "Transport"] as const;
type Tab = (typeof EXPLORE_TABS)[number];

export function TripBoard({ plan }: { plan: TripPlan }) {
  const [day, setDay] = useState(1);
  const [tab, setTab] = useState<Tab>("Itinerary");

  const originPt = plan.origin_geo ?? null;
  const destPt = plan.map_center;
  const pinDots = plan.map_pins.filter((p) => p.lat != null).map((p) => ({ lat: p.lat, lon: p.lon }));
  const pins: MapPin[] = plan.map_pins;

  return (
    <div className="flex flex-col gap-4">
      {/* header + globe */}
      <div className="overflow-hidden rounded-[18px] border border-line-card bg-white">
        <div className="relative h-52 bg-gradient-to-br from-[#0c2440] via-[#10324f] to-[#1c6cb4]">
          <Globe3D origin={originPt} destination={destPt} pins={pinDots} />
          <div className="pointer-events-none absolute top-3 left-4 text-white">
            <p className="font-mono text-[10.5px] tracking-[1.2px] text-white/60 uppercase">Your trip</p>
            <h2 className="mt-1 text-[26px] leading-none font-medium tracking-[-0.5px]">{plan.destination}</h2>
            <p className="mt-1.5 text-[12.5px] text-white/70">{plan.route_summary}</p>
          </div>
          {plan.origin && (
            <span className="pointer-events-none absolute top-3 right-4 rounded-full bg-white/15 px-2.5 py-1 font-mono text-[10.5px] text-white/85 backdrop-blur">
              ✈ {plan.origin} → {plan.destination}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 divide-line-card sm:grid-cols-4 sm:divide-x">
          {[
            ["Days", `${plan.days}`],
            ["Travellers", `${plan.travellers}`],
            ["Est. total", inr(plan.budget.total_inr)],
            ["Places", `${plan.attractions.length}`],
          ].map(([k, v]) => (
            <div key={k} className="px-4 py-3">
              <p className="font-mono text-[10px] tracking-[0.6px] text-ink/45 uppercase">{k}</p>
              <p className="mt-1 text-[16px] font-medium tabular-nums text-ink">{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* interactive map + day chips */}
      <div className="overflow-hidden rounded-[18px] border border-line-card bg-white">
        <div className="flex items-center gap-2 border-b border-line-card px-4 py-2.5">
          <p className="font-mono text-[10.5px] tracking-[1.2px] text-[#1c6cb4] uppercase">Live map</p>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {Array.from({ length: plan.days }, (_, i) => i + 1).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDay(d)}
                className={`rounded-full px-2.5 py-1 font-mono text-[10.5px] transition ${
                  day === d ? "bg-[#1c6cb4] text-white" : "bg-paper text-ink/60 hover:bg-line-pill"
                }`}
              >
                Day {d}
              </button>
            ))}
          </div>
        </div>
        <div className="h-72">
          <CityMap center={destPt ? { lat: destPt.lat, lon: destPt.lon, label: destPt.label } : { lat: 20, lon: 0 }} pins={pins} selectedDay={day} />
        </div>
      </div>

      {/* explore tabs */}
      <div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {EXPLORE_TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium transition ${
                tab === t ? "bg-ink text-white" : "border border-line-pill bg-white text-ink/65 hover:border-ink/30"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "Itinerary" && (
          <ItineraryDay plan={plan} day={day} />
        )}
        {tab === "Places" && (
          <>
            <SectionTitle kicker="Explore" title="Famous places" count={plan.attractions.length} />
            <PlaceGrid items={plan.attractions} />
          </>
        )}
        {tab === "Food" && (
          <>
            <SectionTitle kicker="Eat" title="Where to eat" count={plan.restaurants.length} />
            <RestaurantGrid items={plan.restaurants} />
          </>
        )}
        {tab === "Stays" && (
          <>
            <SectionTitle kicker="Sleep" title="Where to stay" count={plan.hotels.length} />
            <HotelGrid items={plan.hotels} />
          </>
        )}
        {tab === "Transport" && (
          <>
            <SectionTitle kicker="Get there" title="How to travel" count={plan.transport.length} />
            <TransportList items={plan.transport} />
          </>
        )}
      </div>

      {/* budget + highlights + tips */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[18px] border border-line-card bg-white p-4">
          <SectionTitle kicker="Budget" title="Estimated cost" />
          <dl className="space-y-1.5">
            {[
              ["Transport", plan.budget.transport_inr],
              ["Stay", plan.budget.stay_inr],
              ["Food", plan.budget.food_inr],
              ["Activities", plan.budget.activities_inr],
              ["Misc", plan.budget.misc_inr],
            ].map(([k, v]) => (
              <div key={k as string} className="flex items-baseline gap-3 text-[13px]">
                <dt className="text-ink/65">{k}</dt>
                <span className="mb-[3px] flex-1 border-b border-dotted border-line-card" />
                <dd className="font-medium tabular-nums text-ink">{inr(v as number)}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex items-baseline gap-3 border-t border-line-card pt-3 text-[14px]">
            <span className="font-medium text-ink">Total</span>
            <span className="ml-auto font-medium tabular-nums text-[#1c6cb4]">{inr(plan.budget.total_inr)}</span>
          </div>
          {plan.budget.note && <p className="mt-2 text-[11.5px] leading-snug text-ink/50">{plan.budget.note}</p>}
        </div>

        <div className="flex flex-col gap-4">
          {plan.highlights.length > 0 && (
            <div className="rounded-[18px] border border-line-card bg-white p-4">
              <SectionTitle kicker="Don't miss" title="Highlights" />
              <ul className="space-y-2">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex gap-2.5 text-[13px] leading-snug text-ink/75">
                    <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#1c91ec]" />
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {plan.tips.length > 0 && (
            <div className="rounded-[18px] border border-line-card bg-[#1c6cb4] p-4 text-white">
              <p className="font-mono text-[10.5px] tracking-[1.2px] text-white/60 uppercase">Good to know</p>
              <ul className="mt-2.5 space-y-2">
                {plan.tips.map((t) => (
                  <li key={t} className="flex gap-2.5 text-[12.5px] leading-snug text-white/80">
                    <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#5cccfc]" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TripBoard;
