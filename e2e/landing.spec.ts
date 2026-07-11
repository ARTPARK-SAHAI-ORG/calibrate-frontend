// Public (backend-free) tests for the landing page and its public routes.
// Runs in the `public` Playwright project — no backend, no auth.
import { test, expect } from "./fixtures";

test.describe("Landing page", () => {
  test("renders the hero and primary calls to action", async ({ page }) => {
    await page.goto("/");
    // The hero <h1> uses a non-breaking hyphen, so match a substring.
    await expect(
      page.getByRole("heading", { name: /AI agent evaluation for/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Get started" }).first(),
    ).toBeVisible();
  });

  test("product-area nav scrolls to its section", async ({ page }) => {
    await page.goto("/");
    // Each product-area button smooth-scrolls to a landing section.
    await page.getByRole("button", { name: "Simulations" }).first().click();
    await expect(page.locator("#landing-simulations")).toBeInViewport({
      timeout: 10000,
    });
  });

  test("the Get started CTA routes to login", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Get started" }).first().click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("Public routes", () => {
  test("/about redirects to the landing about section", async ({ page }) => {
    await page.goto("/about");
    await expect(page).toHaveURL(/\/#about-calibrate$/);
  });

  test("a protected route bounces a logged-out user to /login", async ({
    page,
  }) => {
    await page.goto("/agents");
    await expect(page).toHaveURL(/\/login/);
  });
});
