/**
 * Interaction tests for adding several people by email at once.
 * `onAddMember` is a jest.fn(), so nothing reaches the backend.
 */
import { render, screen, setupUser, waitFor } from "@/test-utils";
import { AddByEmailPanel } from "../AddByEmailPanel";

jest.mock("../../../lib/reportError", () => ({ reportError: jest.fn() }));

const onAddMember = jest.fn();

const renderPanel = () => render(<AddByEmailPanel onAddMember={onAddMember} />);
const box = () => screen.getByPlaceholderText("teammate@example.com");

beforeEach(() => {
  onAddMember.mockReset().mockResolvedValue(undefined);
});

describe("AddByEmailPanel", () => {
  it("turns a typed address into a chip on Enter", async () => {
    const user = setupUser();
    renderPanel();

    await user.type(box(), "sam@example.com{Enter}");

    expect(
      screen.getByRole("button", { name: "Remove sam@example.com" }),
    ).toBeInTheDocument();
    expect(box()).toHaveValue("");
  });

  it("turns a typed address into a chip on a comma", async () => {
    const user = setupUser();
    renderPanel();

    await user.type(box(), "sam@example.com,");

    expect(
      screen.getByRole("button", { name: "Remove sam@example.com" }),
    ).toBeInTheDocument();
    expect(box()).toHaveValue("");
  });

  it("splits a pasted list into several chips", async () => {
    const user = setupUser();
    renderPanel();

    await user.click(box());
    await user.paste("a@example.com, b@example.com; c@example.com");

    for (const email of ["a@example.com", "b@example.com", "c@example.com"]) {
      expect(
        screen.getByRole("button", { name: `Remove ${email}` }),
      ).toBeInTheDocument();
    }
  });

  it("removes the last chip when Backspace is pressed in an empty box", async () => {
    const user = setupUser();
    renderPanel();

    await user.type(box(), "a@example.com{Enter}b@example.com{Enter}");
    await user.type(box(), "{Backspace}");

    expect(
      screen.queryByRole("button", { name: "Remove b@example.com" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Remove a@example.com" }),
    ).toBeInTheDocument();
  });

  it("refuses something that is not an email address and makes no chip", async () => {
    const user = setupUser();
    renderPanel();

    await user.type(box(), "not-an-address{Enter}");

    expect(
      screen.getByText("not-an-address is not an email address."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
  });

  it("says how many people the button will add", async () => {
    const user = setupUser();
    renderPanel();

    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();

    await user.type(
      box(),
      "a@example.com{Enter}b@example.com{Enter}c@example.com{Enter}",
    );

    expect(
      screen.getByRole("button", { name: "Add 3 people" }),
    ).toBeInTheDocument();
  });

  it("adds one address at a time and clears the chips when all succeed", async () => {
    const user = setupUser();
    renderPanel();

    await user.type(
      box(),
      "a@example.com{Enter}b@example.com{Enter}c@example.com{Enter}",
    );
    await user.click(screen.getByRole("button", { name: "Add 3 people" }));

    await waitFor(() => expect(onAddMember).toHaveBeenCalledTimes(3));
    expect(onAddMember.mock.calls.map((c) => c[0])).toEqual([
      "a@example.com",
      "b@example.com",
      "c@example.com",
    ]);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull(),
    );
    expect(box()).toHaveValue("");
  });

  it("keeps only the address that failed, with its reason", async () => {
    onAddMember.mockImplementation((email: string) =>
      email === "b@example.com"
        ? Promise.reject(new Error("That person is already here"))
        : Promise.resolve(undefined),
    );
    const user = setupUser();
    renderPanel();

    await user.type(
      box(),
      "a@example.com{Enter}b@example.com{Enter}c@example.com{Enter}",
    );
    await user.click(screen.getByRole("button", { name: "Add 3 people" }));

    expect(
      await screen.findByRole("button", { name: "Remove b@example.com" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove a@example.com" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Remove c@example.com" }),
    ).toBeNull();
    expect(
      screen.getByText("b@example.com: That person is already here"),
    ).toBeInTheDocument();
    // Every address was tried, not just the ones before the failure.
    expect(onAddMember).toHaveBeenCalledTimes(3);
  });

  it("stays in its loading state until every address has answered", async () => {
    const answers: Array<() => void> = [];
    onAddMember.mockImplementation(
      () => new Promise<void>((resolve) => answers.push(() => resolve())),
    );
    const user = setupUser();
    renderPanel();

    await user.type(box(), "a@example.com{Enter}b@example.com{Enter}");
    await user.click(screen.getByRole("button", { name: "Add 2 people" }));

    const button = await screen.findByRole("button", {
      name: /Adding people/,
    });
    expect(button).toBeDisabled();

    await waitFor(() => expect(answers).toHaveLength(1));
    answers[0]();
    await waitFor(() => expect(answers).toHaveLength(2));
    // The first has answered, the second has not: still loading.
    expect(
      screen.getByRole("button", { name: /Adding people/ }),
    ).toBeInTheDocument();

    answers[1]();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Adding people/ })).toBeNull(),
    );
  });
});
