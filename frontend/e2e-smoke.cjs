/**
 * End-to-end smoke test for /chat (Playwright, real backend + real LLM).
 *
 *   node e2e-smoke.cjs
 *
 * Verifies the things a unit test can't: the trip board renders with the 3D
 * globe, the Leaflet map and one chip per day; a conversational follow-up does
 * NOT wipe or regenerate the plan; memory (and the board) survive a reload.
 * Screenshots land in the temp dir printed below.
 */

const { chromium } = require("playwright");

const OUT = process.env.SMOKE_OUT || "C:/Users/Ejaz/AppData/Local/Temp/opencode";
const URL = process.env.SMOKE_URL || "http://localhost:3000/chat";

let failures = 0;
const check = (cond, label) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failures += 1;
};

const send = async (page, text) => {
  await page.getByLabel("Message the trip agent").fill(text);
  await page.getByLabel("Send message").click();
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("browser error:", String(e).slice(0, 200)));

  // --- 1. fresh load -------------------------------------------------------
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Message the trip agent").waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/smoke-01-welcome.png` });
  check(true, "welcome screen renders");

  // --- 2. plan a trip ------------------------------------------------------
  await send(page, "Plan a 3 day trip to Jaipur");
  await page.getByRole("heading", { name: "Jaipur", level: 2 }).waitFor({ timeout: 240000 });
  await page.waitForTimeout(5000); // let the globe + map tiles settle

  const canvases = await page.locator("canvas").count();
  const maps = await page.locator(".leaflet-container").count();
  const dayChips = await page.getByRole("button", { name: /^Day \d+$/ }).count();
  check(canvases > 0, `3D globe canvas rendered (${canvases})`);
  check(maps > 0, "Leaflet city map rendered");
  check(dayChips === 3, `one map chip per day (${dayChips})`);
  await page.screenshot({ path: `${OUT}/smoke-02-board.png`, fullPage: true });

  // tabs
  for (const tab of ["Places", "Food", "Stays", "Transport"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await page.waitForTimeout(700);
    const cards = await page.locator("article, li").count();
    check(cards > 0, `${tab} tab renders content`);
    if (tab === "Transport") {
      await page.screenshot({ path: `${OUT}/smoke-03-transport.png`, fullPage: true });
    }
  }
  await page.getByRole("button", { name: "Itinerary", exact: true }).click();

  // --- 3. conversational follow-up must not re-plan ------------------------
  await send(page, "what is the best time to visit?");
  await page
    .getByText(/October|monsoon|winter|season|weather|best time/i)
    .first()
    .waitFor({ timeout: 180000 });
  await page.waitForTimeout(2000);

  const boardStillThere = await page.getByRole("heading", { name: "Jaipur", level: 2 }).count();
  const updatedBadges = await page.getByText(/Trip board updated/).count();
  check(boardStillThere === 1, "trip board still shows the plan");
  check(updatedBadges === 1, `plan was not regenerated (${updatedBadges} board-updated badges)`);
  await page.screenshot({ path: `${OUT}/smoke-04-followup.png`, fullPage: true });

  // --- 4. memory persisted -------------------------------------------------
  const mem = await page.evaluate(() => localStorage.getItem("destinify.memory.v1"));
  const parsed = mem ? JSON.parse(mem) : null;
  check(
    Boolean(parsed && parsed.long && (parsed.long.past_destinations || []).includes("Jaipur")),
    "long-term memory recorded Jaipur",
  );
  check(Boolean(parsed && parsed.short && parsed.short.length >= 4), "short-term thread persisted");

  // --- 5. reload keeps the board -----------------------------------------
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Jaipur", level: 2 }).waitFor({ timeout: 60000 });
  check(true, "trip board restored after reload");
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/smoke-05-reload.png`, fullPage: true });

  await browser.close();
  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
