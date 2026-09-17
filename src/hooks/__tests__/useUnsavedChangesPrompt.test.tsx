import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import * as navigation from "next/navigation";
import { useUnsavedChangesPrompt } from "../useUnsavedChangesPrompt";

// jest.setup.ts hands every test the same router object.
const push = (navigation.useRouter as unknown as () => { push: jest.Mock })()
  .push;

const wentAway = jest.fn();

function Harness({ hasUnsavedChanges }: { hasUnsavedChanges: boolean }) {
  const { guard, isPrompting, stay, leave } =
    useUnsavedChangesPrompt(hasUnsavedChanges);
  return (
    <div>
      {/* A plain anchor on purpose: this is what the hook has to catch, and
          it is what next/link renders. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/somewhere">Somewhere</a>
      <a href="https://example.com">Outside</a>
      <button onClick={() => guard(wentAway)}>Go</button>
      {isPrompting && (
        <div>
          <span>Leave without saving?</span>
          <button onClick={stay}>Cancel</button>
          <button onClick={leave}>Leave</button>
        </div>
      )}
    </div>
  );
}

beforeEach(() => {
  push.mockClear();
  wentAway.mockClear();
});

describe("useUnsavedChangesPrompt", () => {
  it("lets everything through when there is nothing to lose", async () => {
    const user = setupUser();
    render(<Harness hasUnsavedChanges={false} />);
    await user.click(screen.getByText("Go"));
    expect(wentAway).toHaveBeenCalled();
    expect(screen.queryByText("Leave without saving?")).not.toBeInTheDocument();
  });

  it("asks before an action that leaves the page, and runs it on Leave", async () => {
    const user = setupUser();
    render(<Harness hasUnsavedChanges />);
    await user.click(screen.getByText("Go"));
    expect(wentAway).not.toHaveBeenCalled();
    expect(screen.getByText("Leave without saving?")).toBeInTheDocument();

    await user.click(screen.getByText("Leave"));
    expect(wentAway).toHaveBeenCalled();
    expect(screen.queryByText("Leave without saving?")).not.toBeInTheDocument();
  });

  it("stays on the page on Cancel", async () => {
    const user = setupUser();
    render(<Harness hasUnsavedChanges />);
    await user.click(screen.getByText("Go"));
    await user.click(screen.getByText("Cancel"));
    expect(wentAway).not.toHaveBeenCalled();
    expect(screen.queryByText("Leave without saving?")).not.toBeInTheDocument();
  });

  it("asks before a link inside the app, and follows it on Leave", async () => {
    const user = setupUser();
    render(<Harness hasUnsavedChanges />);
    await user.click(screen.getByText("Somewhere"));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText("Leave without saving?")).toBeInTheDocument();

    await user.click(screen.getByText("Leave"));
    expect(push).toHaveBeenCalledWith("/somewhere");
  });

  it("leaves a link to another site alone", async () => {
    const user = setupUser();
    render(<Harness hasUnsavedChanges />);
    await user.click(screen.getByText("Outside"));
    expect(screen.queryByText("Leave without saving?")).not.toBeInTheDocument();
  });

  it("warns before the tab is closed or reloaded, only while there is work to lose", () => {
    const { rerender, unmount } = render(<Harness hasUnsavedChanges />);
    const fire = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(fire()).toBe(true);

    rerender(<Harness hasUnsavedChanges={false} />);
    expect(fire()).toBe(false);

    rerender(<Harness hasUnsavedChanges />);
    expect(fire()).toBe(true);
    unmount();
    expect(fire()).toBe(false);
  });
});
