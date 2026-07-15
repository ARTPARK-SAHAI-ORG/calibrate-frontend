/**
 * DOM helpers for the auto-driving onboarding tour.
 *
 * The tour injects sample values into the app's real forms and clicks its real
 * buttons, so it needs to (a) wait for elements that mount asynchronously (route
 * changes, dialogs, tab switches) and (b) set the value of React-controlled
 * inputs in a way React actually notices.
 */

const DEFAULT_TIMEOUT = 8000;
const POLL_MS = 80;

/**
 * Resolve when an element matching `selector` is present (and, by default,
 * visible) in the DOM, or `null` if it never appears within `timeout`.
 * Never rejects — callers degrade gracefully when an anchor is missing.
 */
export function waitForElement(
  selector: string,
  { timeout = DEFAULT_TIMEOUT, visible = true }: { timeout?: number; visible?: boolean } = {},
): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeout;

    const check = (): HTMLElement | null => {
      const el = document.querySelector<HTMLElement>(selector);
      if (el && (!visible || isVisible(el))) return el;
      return null;
    };

    const found = check();
    if (found) {
      resolve(found);
      return;
    }

    const interval = window.setInterval(() => {
      const el = check();
      if (el) {
        window.clearInterval(interval);
        resolve(el);
      } else if (Date.now() > deadline) {
        window.clearInterval(interval);
        resolve(null);
      }
    }, POLL_MS);
  });
}

/** An element counts as visible if it has layout boxes and isn't hidden. */
export function isVisible(el: HTMLElement): boolean {
  if (el.hidden) return false;
  const rects = el.getClientRects();
  if (rects.length === 0) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none";
}

/**
 * Set the value of a React-controlled `<input>`/`<textarea>` so React's onChange
 * fires. React tracks the previous value on the node; bypassing its setter via
 * the prototype descriptor and dispatching a bubbling `input` event is the
 * documented way to make controlled components pick up a programmatic change.
 */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Wait for an input by selector, then inject `value`. Returns success. */
export async function fillInput(
  selector: string,
  value: string,
  opts?: { timeout?: number },
): Promise<boolean> {
  const el = await waitForElement(selector, opts);
  if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    return false;
  }
  el.focus();
  setNativeValue(el, value);
  return true;
}

/** Wait for a clickable element by selector, then click it. Returns success. */
export async function clickElement(selector: string, opts?: { timeout?: number }): Promise<boolean> {
  const el = await waitForElement(selector, opts);
  if (!el) return false;
  el.click();
  return true;
}

/** Small awaitable delay for letting React flush between injected actions. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
