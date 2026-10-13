import Link from "next/link";
import Nav from "@/components/nav";

export default function Hero() {
  return (
    <section id="top" className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
      {/* sky fallback behind the animated background */}
      <div className="absolute inset-0 -z-30 bg-[linear-gradient(180deg,#1c91ec_0%,#3ba4f2_42%,#7cc7f4_76%,#a6daf9_100%)]" />

      {/* animated hero background (GIF) */}
      <div
        className="absolute inset-0 -z-20 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/hero-bg.gif')" }}
      />

      {/* legibility scrims — soft, so the art still reads through */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(102deg,rgba(3,58,102,0.46)_0%,rgba(3,58,102,0.20)_34%,rgba(3,58,102,0)_60%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-36 bg-[linear-gradient(180deg,rgba(4,52,92,0.45)_0%,rgba(4,52,92,0)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-24 bg-[linear-gradient(0deg,rgba(4,64,60,0.20)_0%,rgba(4,64,60,0)_100%)]" />

      <Nav />

      <div className="relative z-10 mx-auto flex w-full max-w-[1440px] flex-1 flex-col justify-start px-5 pt-6 sm:px-8 sm:pt-10 lg:px-12 lg:pt-14">
        <div className="max-w-[560px] animate-rise">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/12 px-3 py-1.5 text-[12.5px] font-medium text-white/90 backdrop-blur-sm sm:mb-5 sm:text-[13px]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#d9f99d] opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#d9f99d]" />
            </span>
            Trip agent is online
          </p>

          <h1 className="text-[32px] leading-[1.06] font-medium tracking-[-0.5px] text-white sm:text-[44px] sm:leading-[1.08] sm:tracking-[-0.9px] lg:text-[62px] lg:tracking-[-1.2px]">
            Destinify plans an entire trip with agents
          </h1>

          <p className="mt-4 max-w-[470px] text-[15px] leading-[1.5] text-white/80 sm:mt-5 sm:text-[17px] lg:text-[18px]">
            Run flights, stays, itinerary, food, transport, and budget — then change
            your mind mid-plan and let the agent re-book everything.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3 sm:mt-8">
            <Link
              href="/chat"
              className="rounded-full bg-white px-5 py-2.5 text-[15px] font-medium text-[#202020] shadow-[0_4px_16px_rgba(2,80,130,0.28)] transition-transform duration-200 hover:-translate-y-0.5 sm:px-6 sm:py-3 sm:text-[16px]"
            >
              Plan a trip
            </Link>
            <a
              href="#how"
              className="rounded-full border border-[#5cccfc] px-5 py-2.5 text-[15px] font-medium text-white transition-colors duration-200 hover:bg-[#5cccfc]/18 sm:px-6 sm:py-3 sm:text-[16px]"
            >
              See a sample trip
            </a>
          </div>

          <p className="mt-5 hidden text-[13.5px] text-white/62 sm:mt-7 sm:block">
            4,120 trips planned this month · no card required
          </p>
        </div>
      </div>
    </section>
  );
}
