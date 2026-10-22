process.env.NEXT_PUBLIC_BACKEND_URL ||= "http://backend.test";

/** Point window.location at a page, so a test can read where it was sent. */
export function setLocation(search: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { search, href: "", pathname: "/" },
  });
}

/** Make the next backend call answer with this status and body. */
export function mockFetchOnce(status: number, body: unknown = {}) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

export const LOGIN = {
  access_token: "jwt-123",
  token_type: "bearer",
  user: { email: "a@b.co" },
};

export function sentBody(fetchMock: jest.Mock) {
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}
