import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("explorer smoke", () => {
  test("overview loads", async ({ page }) => {
    await page.goto("./");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByText("How this stays up to date")).toBeVisible();
  });

  test("packages page separates concepts", async ({ page }) => {
    await page.goto("./packages/");
    await expect(page.getByText("Scan coverage")).toBeVisible();
    await expect(
      page.getByText("Project links (repo↔repo), packages"),
    ).toBeVisible();
  });

  test("no mermaid runtime in bundle", async ({ page }) => {
    await page.goto("./domains/ausmittlung/");
    const mermaidRuntime = page.locator("script[src*='mermaid']");
    await expect(mermaidRuntime).toHaveCount(0);
    await expect(page.getByText("Heuristic")).toBeVisible();
  });

  test("axe critical issues on overview", async ({ page }) => {
    await page.goto("./");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const serious = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(serious).toEqual([]);
  });
});
