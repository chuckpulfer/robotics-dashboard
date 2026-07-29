import { test, expect } from "@playwright/test";
import { startStaticServer } from "./helpers/server.js";
import { mockTba, openApp, openSettings, readConfig } from "./helpers/app.js";

/**
 * Team and event are chosen from the header chips; Settings keeps only the API key and
 * the data controls. The risk here is a Settings save clobbering the team or event that
 * the header owns, since both write the same config object.
 */

let server;
test.beforeAll(async () => { server = await startStaticServer(); });
test.afterAll(async () => { await server.close(); });
test.use({ serviceWorkers: "block" });

const saveAndSettle = async (page, id) => {
  await page.click(`#${id}`);
  await expect(page.locator(`#${id}`)).toHaveText(/Saved!|refresh failed/, { timeout: 40_000 });
};

// The "Saved!" label reverts after ~1.6s; wait it out before driving the next save.
const settleLabel = (page) => page.waitForTimeout(2000);

test.beforeEach(async ({ page }) => {
  await mockTba(page, {});
  await openApp(page, server.baseURL);
  await openSettings(page);
});

test("no longer duplicates the header's team and event pickers", async ({ page }) => {
  const summaries = await page.$$eval("#page-settings details summary", (els) => els.map((e) => e.textContent));
  expect(summaries[0]).toBe("API and data");
  expect(summaries).not.toContain("Team and event");
  await expect(page.locator("#saveApiBtn")).toBeVisible();
  // The controls the header replaced are gone, not merely hidden.
  for (const id of ["teamPicker", "eventSelect", "saveTeamBtn"]) {
    await expect(page.locator(`#${id}`)).toHaveCount(0);
  }
  await expect(page.locator("#teamChip")).toBeVisible();
  await expect(page.locator("#eventChip")).toBeVisible();
});

test("keeps the team directory download, which the All teams tab points at", async ({ page }) => {
  await expect(page.locator("#refreshTeamsBtn")).toBeVisible();
  await page.click("#refreshTeamsBtn");
  await expect(page.locator("#teamDirNote")).not.toHaveText("");
});

test("offers a manual event key only when there is no API key", async ({ page }) => {
  // With a key, the header chip searches the downloaded event list instead.
  await expect(page.locator("#eventKeyWrap")).toBeHidden();

  await page.fill("#tbaKey", "");
  await saveAndSettle(page, "saveApiBtn");
  await expect(page.locator("#eventKeyWrap")).toBeVisible();
  await expect(page.locator("#eventKeyHelp")).toContainText("No API key");
});

test("the API section saves its own fields", async ({ page }) => {
  await page.fill("#tbaKey", "my-secret-key");
  await page.fill("#refreshSeconds", "90");
  await page.check("#statboticsEnabled");
  await saveAndSettle(page, "saveApiBtn");

  const cfg = await readConfig(page);
  expect(cfg.tbaKey).toBe("my-secret-key");
  expect(cfg.refreshSeconds).toBe(90);
  expect(cfg.statbotics).toBe(true);
});

test("an API save leaves the team and event alone", async ({ page }) => {
  const before = await readConfig(page);

  await page.fill("#refreshSeconds", "120");
  await saveAndSettle(page, "saveApiBtn");

  const cfg = await readConfig(page);
  expect(cfg.team).toBe(before.team);
  expect(cfg.eventKey).toBe(before.eventKey);
  expect(cfg.refreshSeconds).toBe(120);
});

test("settings survive a reload", async ({ page }) => {
  await page.fill("#tbaKey", "my-secret-key");
  await page.fill("#refreshSeconds", "120");
  await page.check("#statboticsEnabled");
  await saveAndSettle(page, "saveApiBtn");

  await page.reload();
  await page.waitForSelector(".tab");
  await openSettings(page);

  await expect(page.locator("#tbaKey")).toHaveValue("my-secret-key");
  await expect(page.locator("#refreshSeconds")).toHaveValue("120");
  await expect(page.locator("#statboticsEnabled")).toBeChecked();
});

test("the descriptions stay short", async ({ page }) => {
  const notes = await page.$$eval("#page-settings .note", (els) =>
    els.map((e) => e.textContent.trim()).filter((t) => t && !/cached|Event key:|not downloaded/i.test(t)));
  expect(notes.length).toBeGreaterThan(4);
  // They were full paragraphs (208 chars at the worst) before being trimmed.
  expect(Math.max(...notes.map((n) => n.length))).toBeLessThanOrEqual(110);
});

test("explains how to add the app to the home screen", async ({ page }) => {
  const steps = await page.evaluate(() => {
    const panel = [...document.querySelectorAll("#page-settings details")]
      .find((d) => d.querySelector("summary")?.textContent === "Add to Home Screen");
    return panel ? [...panel.querySelectorAll(".steps li")].map((li) => li.textContent.replace(/\s+/g, " ")) : null;
  });
  expect(steps).not.toBeNull();
  expect(steps.some((s) => /iPhone/.test(s) && /Safari/.test(s) && /Add to Home Screen/.test(s))).toBe(true);
  expect(steps.some((s) => /Android/.test(s) && /Chrome/.test(s))).toBe(true);
});
