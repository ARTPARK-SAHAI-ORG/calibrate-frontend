/**
 * Shared helpers for component interaction tests (React Testing Library).
 *
 * Import from here instead of `@testing-library/react` directly so every test
 * gets the same provider wrapper and the same `userEvent` setup:
 *
 *   import { render, screen, setupUser } from "@/test-utils";
 *
 * `render` wraps the component in the app-level context providers that many
 * components expect (currently `FloatingButtonProvider`, used by every dialog
 * via `useHideFloatingButton`). Add new global providers here in one place so
 * individual tests don't have to.
 */
import React from "react";
import { render as rtlRender, RenderOptions } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FloatingButtonProvider } from "@/components/providers/FloatingButtonProvider";

function AllProviders({ children }: { children: React.ReactNode }) {
  return <FloatingButtonProvider>{children}</FloatingButtonProvider>;
}

/**
 * Render a component wrapped in the app's global providers.
 * Same signature/return as RTL's `render`.
 */
function render(ui: React.ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return rtlRender(ui, { wrapper: AllProviders, ...options });
}

/**
 * Create a `userEvent` instance for simulating real clicks/typing.
 * Call once at the top of each test: `const user = setupUser();`
 */
function setupUser() {
  return userEvent.setup();
}

// Re-export everything from RTL so tests only need this one import.
export * from "@testing-library/react";
export { render, setupUser, userEvent };
