import { test, expect } from "@playwright/test";

/**
 * Example end-to-end test: real browser, real page, real clicks.
 *
 * /login is a public route (bypasses auth middleware) and its client-side
 * validation runs before any backend call, so this whole spec passes with no
 * backend running — a good template for E2E that stays in the frontend.
 *
 * For flows that DO need the backend (create an agent, run a test), point
 * NEXT_PUBLIC_BACKEND_URL at a real/staging API or mock it with
 * `page.route(...)`. See e2e/README.md.
 */
test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("renders the sign-in form", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("toggles password visibility when the eye icon is clicked", async ({
    page,
  }) => {
    const password = page.getByLabel("Password");
    await password.fill("secret123");
    await expect(password).toHaveAttribute("type", "password");

    // The toggle is the button next to the password input (no accessible name).
    await page.locator("button[type='button']").last().click();
    await expect(password).toHaveAttribute("type", "text");
  });

  test("shows client-side validation error for a short password", async ({
    page,
  }) => {
    await page.getByLabel("Email").fill("user@example.com");
    await page.getByLabel("Password").fill("123"); // < 6 chars
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(
      page.getByText("Password must be at least 6 characters"),
    ).toBeVisible();
    // Stayed on /login — no navigation happened.
    await expect(page).toHaveURL(/\/login$/);
  });
});
