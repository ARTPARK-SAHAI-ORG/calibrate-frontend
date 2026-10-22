process.env.NEXT_PUBLIC_BACKEND_URL ||= "http://backend.test";

/** Point window.location at a page, so a test can read where it was sent. */
export function setLocation(search: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { search, href: "", pathname: "/" },
  });
}

export type Answer = [status: number, body?: unknown] | "unreachable";

/**
 * Make the backend answer each call in turn, the last answer repeating. Returns
 * the mock so a test can read what was sent.
 */
export function fakeBackend(...answers: Answer[]) {
  let call = 0;
  const fetchMock = jest.fn<Promise<unknown>, [string, RequestInit?]>(() => {
    const answer = answers[Math.min(call++, answers.length - 1)];
    return answer === "unreachable"
      ? Promise.reject(new TypeError("Failed to fetch"))
      : Promise.resolve({
          ok: answer[0] >= 200 && answer[0] < 300,
          status: answer[0],
          json: async () => answer[1] ?? {},
        });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

export const LOGIN = {
  access_token: "jwt-123",
  token_type: "bearer",
  user: { email: "a@b.co" },
};

/** What the call at `index` sent to the backend */
export function sentBody(fetchMock: jest.Mock, index = 0) {
  return JSON.parse(String(fetchMock.mock.calls[index][1]?.body));
}

/**
 * Find a sentence even when parts of it sit in separate elements, such as the
 * email address `TextWithEmail` wraps on its own.
 */
export function fullText(text: string) {
  return (_: string, el: Element | null) =>
    el?.textContent === text &&
    !Array.from(el.children).some((child) => child.textContent === text);
}
