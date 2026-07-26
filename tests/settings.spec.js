import { test, expect } from "@playwright/test";
import { startStaticServer } from "./helpers/server.js";
import { mockTba, openApp, openSettings, readConfig } from "./helpers/app.js";

/**
 * Team/event and API settings save independently. They share one config object, so
 * the risk is one section's Save overwriting fields owned by the other.
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

test("splits into two sections with their own save buttons", async ({ page }) => {
  const summaries = await page.$$eval("#page-settings details summary", (els) => els.map((e) => e.textContent));
  expect(summaries.slice(0, 2)).toEqual(["Team and event", "API and data"]);
  await expect(page.locator("#saveTeamBtn")).toBeVisible();
  await expect(page.locator("#saveApiBtn")).toBeVisible();
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
  await expect(page.locator("#saveTeamBtn")).toHaveText("Save and refresh");
});

test("saving the team does not clobber the API settings", async ({ page }) => {
  await page.fill("#tbaKey", "my-secret-key");
  await page.fill("#refreshSeconds", "90");
  await page.check("#statboticsEnabled");
  await saveAndSettle(page, "saveApiBtn");
  await settleLabel(page);

  await page.fill("#teamPicker", "2056");
  await saveAndSettle(page, "saveTeamBtn");

  const cfg = await readConfig(page);
  expect(cfg.team).toBe(2056);
  expect(cfg.tbaKey).toBe("my-secret-key");
  expect(cfg.refreshSeconds).toBe(90);
  expect(cfg.statbotics).toBe(true);
});

test("saving the API section does not clobber the team or event", async ({ page }) => {
  await page.fill("#teamPicker", "2056");
  await saveAndSettle(page, "saveTeamBtn");
  await settleLabel(page);
  const before = await readConfig(page);

  await page.fill("#refreshSeconds", "120");
  await saveAndSettle(page, "saveApiBtn");

  const cfg = await readConfig(page);
  expect(cfg.team).toBe(2056);
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
