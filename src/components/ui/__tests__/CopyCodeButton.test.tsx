import { render, screen, setupUser, waitFor } from "@/test-utils";
import { CopyCodeButton } from "../CopyCodeButton";
import { copyToClipboard } from "@/lib/clipboard";

jest.mock("../../../lib/clipboard", () => ({
  __esModule: true,
  copyToClipboard: jest.fn(),
}));

const mockCopy = copyToClipboard as jest.Mock;

beforeEach(() => {
  // true means the text really reached the clipboard.
  mockCopy.mockReset().mockResolvedValue(true);
});

it("copies the code and says so", async () => {
  const user = setupUser();
  render(<CopyCodeButton value={'{ "input": "Hi" }'} />);

  await user.click(screen.getByRole("button", { name: "Copy code" }));

  expect(mockCopy).toHaveBeenCalledWith('{ "input": "Hi" }');
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument(),
  );
});

it("takes its own label, so a page of them reads apart", () => {
  render(<CopyCodeButton value="x" label="Copy the request body" />);

  expect(
    screen.getByRole("button", { name: "Copy the request body" }),
  ).toBeInTheDocument();
});

// Saying "Copied" when nothing was copied sends someone off to paste an empty
// clipboard into a chat.
it("does not say it copied when the clipboard refused", async () => {
  mockCopy.mockResolvedValue(false);
  const user = setupUser();
  render(<CopyCodeButton value='{ "input": "Hi" }' />);

  await user.click(screen.getByRole("button", { name: "Copy code" }));

  expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
});
