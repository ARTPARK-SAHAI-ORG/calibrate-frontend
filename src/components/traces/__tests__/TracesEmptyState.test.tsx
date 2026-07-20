import { render, screen } from "@/test-utils";
import { TracesEmptyState } from "../TracesEmptyState";

jest.mock("../../../lib/api", () => ({
  __esModule: true,
  getBackendUrl: jest.fn(() => "https://api.example.com"),
}));

it("explains the feature and links to workspace settings for the API key", () => {
  render(<TracesEmptyState />);
  expect(screen.getByText("No traces yet")).toBeInTheDocument();
  const link = screen.getByRole("link", { name: /workspace settings/i });
  expect(link).toHaveAttribute("href", "/workspace-settings");
});

it("shows a copy-paste ingest snippet against the resolved backend URL", () => {
  render(<TracesEmptyState />);
  expect(
    screen.getByText(/curl -X POST https:\/\/api\.example\.com\/traces/),
  ).toBeInTheDocument();
});

it("falls back to a placeholder host when the backend URL is unset", () => {
  const api = jest.requireMock("../../../lib/api");
  api.getBackendUrl.mockImplementationOnce(() => {
    throw new Error("BACKEND_URL environment variable is not set");
  });
  render(<TracesEmptyState />);
  expect(screen.getByText(/curl -X POST https:\/\/<backend>\/traces/)).toBeInTheDocument();
});
