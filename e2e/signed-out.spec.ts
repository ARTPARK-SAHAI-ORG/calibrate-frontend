// What someone who is not signed in sees.
//
// Every page behind sign-in now sits under the workspace it belongs to
// (`/<workspace-id>/agents`), and an address without a workspace is answered by
// the opening page, which works the workspace out. Neither of those may leak a
// page to someone who is not signed in, and neither may lose the page they
// asked for on the way to signing in.
//
// No backend and no account: the middleware decides all of this before any
// page renders, so this spec runs in the public project.
//
// Import from ./fixtures so E2E coverage is collected when E2E_COVERAGE=1.
import { test, expect } from "./fixtures";

const WORKSPACE = "8f3c1a2b-4d5e-4f6a-8b9c-0d1e2f3a4b5c";

test.describe("Signed out", () => {
  test("an app page sends you to sign in and remembers the page", async ({
    page,
  }) => {
    await page.goto("/tests?testId=abc");

    await expect(page).toHaveURL(
      `/login?callbackUrl=${encodeURIComponent("/tests?testId=abc")}`,
    );
    await expect(
      page.getByRole("heading", { name: "Welcome back", exact: true }),
    ).toBeVisible();
  });

  test("a page that names a workspace also sends you to sign in", async ({
    page,
  }) => {
    const wanted = `/${WORKSPACE}/simulations/abc/runs/def`;
    await page.goto(wanted);

    await expect(page).toHaveURL(
      `/login?callbackUrl=${encodeURIComponent(wanted)}`,
    );
  });

  test("the opening page is not a way in", async ({ page }) => {
    await page.goto("/opening");

    await expect(page).toHaveURL(
      `/login?callbackUrl=${encodeURIComponent("/opening")}`,
    );
  });

  test("a shared result link opens without signing in", async ({ page }) => {
    // The token is not a real one, so the page cannot load its content without
    // a backend. What matters here is that it is never sent to sign in.
    await page.goto("/public/test-run/not-a-real-token");

    await expect(page).toHaveURL("/public/test-run/not-a-real-token");
  });

  test("the landing page still opens", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL("/");
  });

  test("a blog post opens without signing in", async ({ page }) => {
    const post = "/blog/the-model-is-no-longer-the-problem";
    await page.goto(post);

    await expect(page).toHaveURL(post);
    await expect(
      page.getByRole("heading", { name: "The model is no longer the problem" }),
    ).toBeVisible();
  });
});
