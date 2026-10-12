type Status = "done" | "running";

type Card = {
  status: Status;
  label: string;
  title: string;
  meta: string;
  /** position on the hero, % of the section box */
  pos: string;
  delay: string;
  width: string;
};

const CARDS: Card[] = [
  {
    status: "done",
    label: "Task Completed",
    title: "7-day Kyoto itinerary",
    meta: "12 stops · 4 reservations",
    pos: "xl:left-[50%] xl:top-[29%]",
    delay: "0s",
    width: "xl:w-[262px]",
  },
  {
    status: "running",
    label: "Task running",
    title: "Comparing ryokans in Gion",
    meta: "scanning 18 stays",
    pos: "xl:left-[70%] xl:top-[41%]",
    delay: "1.1s",
    width: "xl:w-[248px]",
  },
  {
    status: "done",
    label: "Task Completed",
    title: "Flights held · ¥62,400",
    meta: "HND → KIX · 2 travellers",
    pos: "xl:left-[53%] xl:top-[52%]",
    delay: "2.2s",
    width: "xl:w-[256px]",
  },
];

function DoneIcon() {
  return (
    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#34a853]">
      <svg width="10" height="8" viewBox="0 0 10 8" aria-hidden="true">
        <path
          d="M1 4.2 3.6 6.8 9 1.4"
          fill="none"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinecap="square"
        />
      </svg>
    </span>
  );
}

function RunningIcon() {
  return (
    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="animate-spin"
        style={{ animationDuration: "1.1s" }}
      >
        <circle cx="8" cy="8" r="6.4" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="2.4" />
        <path
          d="M8 1.6a6.4 6.4 0 0 1 6.4 6.4"
          fill="none"
          stroke="#5cccfc"
          strokeWidth="2.4"
          strokeLinecap="butt"
        />
      </svg>
    </span>
  );
}

export default function TaskCards() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 hidden xl:block" aria-hidden="true">
      {CARDS.map((c) => (
        <figure
          key={c.title}
          className={`absolute ${c.pos} ${c.width} animate-float rounded-[10px] border border-white/25 bg-[#1c6cb4]/92 p-3 shadow-[0_16px_38px_-16px_rgba(2,46,84,0.85)] backdrop-blur-md`}
          style={{ animationDelay: c.delay, animationDuration: "7s" }}
        >
          <figcaption className="flex items-center gap-2">
            {c.status === "done" ? <DoneIcon /> : <RunningIcon />}
            <span className="text-[11.5px] font-medium tracking-[0.3px] text-[#5cccfc]">
              {c.label}
            </span>
          </figcaption>
          <p className="mt-2 text-[14.5px] leading-tight font-medium text-white">{c.title}</p>
          <p className="mt-1 text-[12px] leading-tight text-white/60">{c.meta}</p>
        </figure>
      ))}
    </div>
  );
}
