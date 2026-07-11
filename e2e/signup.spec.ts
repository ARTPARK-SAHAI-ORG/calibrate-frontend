// Public (backend-free) tests for the signup page. All of signup's client-side
// validation and live feedback runs before any backend call, so this whole
// spec passes with no backend — it runs in the `public` Playwright project.
import { test, expect } from "./fixtures";

test.describe("Signup page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/signup");
  });

  test("renders the signup form", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Create your account" }),
    ).toBeVisible();
    await expect(page.getByPlaceholder("John", { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Doe", { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("john@example.com")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create account" }),
    ).toBeVisible();
  });

  test("keeps the submit button disabled until the form is valid", async ({
    page,
  }) => {
    const submit = page.getByRole("button", { name: "Create account" });
    await expect(submit).toBeDisabled();

    await page.getByPlaceholder("John", { exact: true }).fill("Ada");
    await page.getByPlaceholder("Doe", { exact: true }).fill("Lovelace");
    await page.getByPlaceholder("john@example.com").fill("ada@example.com");
    await page.getByPlaceholder("Create a strong password").fill("secret123");
    // Mismatched confirm keeps it disabled and shows the live mismatch message.
    await page.getByPlaceholder("Confirm your password").fill("secret999");
    await expect(page.getByText("Passwords do not match")).toBeVisible();
    await expect(submit).toBeDisabled();

    // Matching passwords enable submit.
    await page.getByPlaceholder("Confirm your password").fill("secret123");
    await expect(page.getByText("Passwords do not match")).toHaveCount(0);
    await expect(submit).toBeEnabled();
  });

  test("shows a live password-strength label", async ({ page }) => {
    await page.getByPlaceholder("Create a strong password").fill("abc");
    await expect(page.getByText("Weak", { exact: true })).toBeVisible();

    await page
      .getByPlaceholder("Create a strong password")
      .fill("Abcd1234!xyz");
    await expect(page.getByText("Strong", { exact: true })).toBeVisible();
  });

  test("both password fields have working visibility toggles", async ({
    page,
  }) => {
    const password = page.locator("#password");
    const confirm = page.locator("#confirmPassword");
    await password.fill("secret123");
    await confirm.fill("secret123");
    await expect(password).toHaveAttribute("type", "password");
    await expect(confirm).toHaveAttribute("type", "password");

    await page.locator("#password ~ button").click();
    await expect(password).toHaveAttribute("type", "text");

    await page.locator("#confirmPassword ~ button").click();
    await expect(confirm).toHaveAttribute("type", "text");
  });

  test("links to the login page", async ({ page }) => {
    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
