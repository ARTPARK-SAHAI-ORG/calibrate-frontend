import { requestTour, TOUR_IDS, TOUR_REQUEST_EVENT } from "../index";

describe("onboarding index", () => {
  it("dispatches a tour request event with the tour id", () => {
    const handler = jest.fn();
    window.addEventListener(TOUR_REQUEST_EVENT, handler);

    requestTour(TOUR_IDS.firstEval);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toBe(TOUR_IDS.firstEval);
  });
});
