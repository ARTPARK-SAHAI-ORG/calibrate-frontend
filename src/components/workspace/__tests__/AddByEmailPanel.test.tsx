/**
 * Interaction tests for adding several people by email at once.
 * `onAddMember` is a jest.fn(), so nothing reaches the backend.
 */
import { render, screen, setupUser, waitFor } from "@/test-utils";
import { AddByEmailPanel } from "../AddByEmailPanel";

jest.mock("../../../lib/reportError", () => ({ reportError: jest.fn() }));

const onAddMember = jest.fn();

const renderPanel = () => render(<AddByEmailPanel onAddMember={onAddMember} />);
// By its name, not its placeholder: the placeholder is dropped once there is
// an address in the box, the way every address field behaves.
const box = () => screen.getByRole("textbox", { name: "Email address" });

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

  // Nothing is emailed and there is nothing to accept, so the screen has to
  // say what actually happens next.
  it("says what happens after they are added", () => {
    render(<AddByEmailPanel onAddMember={onAddMember} />);

    expect(
      screen.getByText(/the workspace will be visible to them/i),
    ).toBeInTheDocument();
  });

  // Every password manager has its own opt-out and ignores everyone else's, so
  // dropping one quietly brings its suggestion list back over the box.
  it("asks the browser and the password managers to leave the box alone", () => {
    render(<AddByEmailPanel onAddMember={onAddMember} />);

    const input = screen.getByRole("textbox", { name: "Email address" });
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("data-1p-ignore");
    expect(input).toHaveAttribute("data-lpignore", "true");
    expect(input).toHaveAttribute("data-bwignore");
    expect(input).toHaveAttribute("data-form-type", "other");
  });

  it("says it is finished once every address went in", async () => {
    const onAllAdded = jest.fn();
    const user = setupUser();
    render(
      <AddByEmailPanel onAddMember={onAddMember} onAllAdded={onAllAdded} />,
    );

    await user.type(box(), "a@b.com{Enter}");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(onAllAdded).toHaveBeenCalledTimes(1));
  });

  // Something went wrong and it is on screen, so the reader has to stay here
  // to see it.
  it("does not say it is finished when an address failed", async () => {
    const onAllAdded = jest.fn();
    onAddMember.mockRejectedValueOnce(new Error("Already a member"));
    const user = setupUser();
    render(
      <AddByEmailPanel onAddMember={onAddMember} onAllAdded={onAllAdded} />,
    );

    await user.type(box(), "a@b.com{Enter}");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText(/Already a member/)).toBeInTheDocument();
    expect(onAllAdded).not.toHaveBeenCalled();
  });

  // The same address twice used to make two chips sharing one name, so
  // removing either took both away, and the button promised more than it sent.
  it("keeps one of each address, however many times it is given", async () => {
    const user = setupUser();
    render(<AddByEmailPanel onAddMember={onAddMember} />);

    await user.type(box(), "a@b.com,a@b.com,c@d.com{Enter}");

    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Add 2 people" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add 2 people" }));
    await waitFor(() => expect(onAddMember).toHaveBeenCalledTimes(2));
  });

  it("counts the same address in the box and on a chip only once", async () => {
    const user = setupUser();
    render(<AddByEmailPanel onAddMember={onAddMember} />);

    await user.type(box(), "a@b.com{Enter}");
    await user.type(box(), "a@b.com");

    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("says it is busy while it works and says so again when it stops", async () => {
    const onBusyChange = jest.fn();
    const user = setupUser();
    render(
      <AddByEmailPanel onAddMember={onAddMember} onBusyChange={onBusyChange} />,
    );

    await user.type(box(), "a@b.com{Enter}");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false));
    expect(onBusyChange.mock.calls.map((c) => c[0])).toEqual([true, false]);
  });

  it("refuses to add when something in the box is not an address", async () => {
    const user = setupUser();
    render(<AddByEmailPanel onAddMember={onAddMember} />);

    await user.type(box(), "a@b.com{Enter}");
    await user.type(box(), "not-an-address");
    await user.click(screen.getByRole("button", { name: "Add 2 people" }));

    expect(
      await screen.findByText("not-an-address is not an email address."),
    ).toBeInTheDocument();
    expect(onAddMember).not.toHaveBeenCalled();
  });

  it("takes an address back off with its cross", async () => {
    const user = setupUser();
    render(<AddByEmailPanel onAddMember={onAddMember} />);

    await user.type(box(), "a@b.com,c@d.com{Enter}");
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Remove a@b.com" }));

    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });
});
