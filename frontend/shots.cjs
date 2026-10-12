const { chromium } = require("playwright");

const OUT = "C:/Users/Ejaz/AppData/Local/Temp/opencode";
const URL = "http://localhost:3210";

async function shot(page, name, opts = {}) {
  await page.screenshot({ path: `${OUT}/${name}.png`, ...opts });
  console.log("saved", name);
}

(async () => {
  const browser = await chromium.launch();

  // --- desktop hero ---
  const d = await browser.newPage({ viewport: { width: 1440, height: 760 }, deviceScaleFactor: 1 });
  await d.goto(URL, { waitUntil: "networkidle" });
  await d.waitForTimeout(1200);
  await shot(d, "01-desktop-hero");

  // --- desktop: task cards region ---
  await shot(d, "02-desktop-full", { fullPage: true });

  // --- chat: send a message and capture the agent working ---
  await d.locator("#chat").scrollIntoViewIfNeeded();
  await d.waitForTimeout(400);
  await shot(d, "03-chat-idle");

  await d.getByLabel("Message your trip agent").fill("Cheapest warm week in March for two");
  await d.getByLabel("Send message").click();
  await d.waitForTimeout(1500);
  await shot(d, "04-chat-working");
  await d.waitForTimeout(4500);
  await shot(d, "05-chat-done");

  // --- mobile ---
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await m.goto(URL, { waitUntil: "networkidle" });
  await m.waitForTimeout(900);
  await shot(m, "06-mobile-hero");
  await shot(m, "07-mobile-full", { fullPage: true });

  // --- ultrawide ---
  const u = await browser.newPage({ viewport: { width: 2560, height: 860 }, deviceScaleFactor: 1 });
  await u.goto(URL, { waitUntil: "networkidle" });
  await u.waitForTimeout(900);
  await shot(u, "08-ultrawide-hero");

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
