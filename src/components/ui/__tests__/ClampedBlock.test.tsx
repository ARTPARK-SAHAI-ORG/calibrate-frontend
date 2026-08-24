import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import { ClampedBlock } from "../ClampedBlock";

// jsdom reports every element as zero-height, so the component's own
// measurement never fires. Each test stubs scrollHeight to say whether the
// content is taller than the limit.
class MockResizeObserver {
  observe() {}
  disconnect() {}
}

beforeAll(() => {
  (
    global as unknown as { ResizeObserver: typeof MockResizeObserver }
  ).ResizeObserver = MockResizeObserver;
});

function stubScrollHeight(px: number) {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      return px;
    },
  });
}

afterEach(() => {
  stubScrollHeight(0);
});

describe("ClampedBlock", () => {
  it("shows nothing extra when the content fits", () => {
    stubScrollHeight(100);
    render(
      <ClampedBlock maxHeightPx={176}>
        <p>Short content</p>
      </ClampedBlock>,
    );
    expect(screen.getByText("Short content")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /View more/ }),
    ).not.toBeInTheDocument();
  });

  it("offers View more when the content is taller than the limit", () => {
    stubScrollHeight(900);
    render(
      <ClampedBlock maxHeightPx={176}>
        <p>Long content</p>
      </ClampedBlock>,
    );
    expect(
      screen.getByRole("button", { name: /View more/ }),
    ).toBeInTheDocument();
  });

  it("opens on View more and closes again on View less", async () => {
    stubScrollHeight(900);
    const user = setupUser();
    render(
      <ClampedBlock maxHeightPx={176}>
        <p>Long content</p>
      </ClampedBlock>,
    );
    await user.click(screen.getByRole("button", { name: /View more/ }));
    expect(
      screen.queryByRole("button", { name: /View more/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /View less/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /View less/ }));
    expect(
      screen.getByRole("button", { name: /View more/ }),
    ).toBeInTheDocument();
  });
});
