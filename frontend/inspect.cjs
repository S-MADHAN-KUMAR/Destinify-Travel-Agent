const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 760 } });
  await p.goto("http://localhost:3210", { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  const info = await p.evaluate(() => {
    const h1 = document.querySelector("h1");
    const box = h1?.getBoundingClientRect();
    const cs = h1 ? getComputedStyle(h1) : null;
    const parent = h1?.parentElement;
    const pcb = parent?.getBoundingClientRect();
    const pcs = parent ? getComputedStyle(parent) : null;
    const section = document.querySelector("section#top");
    const sb = section?.getBoundingClientRect();
    return {
      h1Text: h1?.textContent,
      h1Box: box && { x: box.x, y: box.y, w: box.width, h: box.height },
      h1Style: cs && { color: cs.color, opacity: cs.opacity, fontSize: cs.fontSize, zIndex: cs.zIndex, animation: cs.animation },
      parentBox: pcb && { x: pcb.x, y: pcb.y, w: pcb.width, h: pcb.height },
      parentStyle: pcs && { opacity: pcs.opacity, animation: pcs.animation, display: pcs.display, zIndex: pcs.zIndex },
      sectionBox: sb && { x: sb.x, y: sb.y, w: sb.width, h: sb.height },
      rectCount: document.querySelectorAll("svg rect").length,
      svgBox: (() => { const s = document.querySelector("#top > svg"); const r = s?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height }; })(),
      htmlLen: document.documentElement.outerHTML.length,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await b.close();
})();
