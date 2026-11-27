jest.mock("@sentry/nextjs", () => ({
  init: jest.fn(),
  replayIntegration: () => ({}),
  captureRouterTransitionStart: () => {},
}));

import * as Sentry from "@sentry/nextjs";
import "../instrumentation-client";

describe("browser Sentry setup", () => {
  it("does not send an expired login to Sentry", () => {
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        ignoreErrors: ["Unauthorized - session expired"],
      }),
    );
  });
});
