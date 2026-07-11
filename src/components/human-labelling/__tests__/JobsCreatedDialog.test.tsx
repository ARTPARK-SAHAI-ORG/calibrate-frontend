import { render, screen, setupUser, waitFor } from "@/test-utils";
import { JobsCreatedDialog, type CreatedJob } from "../JobsCreatedDialog";

const jobs: CreatedJob[] = [
  {
    uuid: "j1",
    public_token: "tok1",
    annotator_id: "a1",
    annotator_name: "Alice",
    item_count: 3,
    status: "pending",
  },
  {
    uuid: "j2",
    public_token: "tok2",
    annotator_id: "a2",
    annotator_name: "Bob",
    item_count: 5,
    status: "pending",
  },
];

// @testing-library/user-event installs its own clipboard stub on
// `navigator.clipboard` the first time `userEvent.setup()` runs, so any
// override has to happen *after* setup — otherwise user-event's stub wins.
function spyOnClipboardWriteText() {
  return jest.spyOn(navigator.clipboard, "writeText");
}

describe("JobsCreatedDialog", () => {
  it("renders nothing when closed", () => {
    render(<JobsCreatedDialog isOpen={false} jobs={jobs} onClose={jest.fn()} />);
    expect(screen.queryByText(/new job/)).not.toBeInTheDocument();
  });

  it("shows a singular heading for one job", () => {
    render(
      <JobsCreatedDialog isOpen jobs={[jobs[0]]} onClose={jest.fn()} />,
    );
    expect(screen.getByText("1 new job created")).toBeInTheDocument();
  });

  it("shows a plural heading and lists all jobs", () => {
    render(<JobsCreatedDialog isOpen jobs={jobs} onClose={jest.fn()} />);
    expect(screen.getByText("2 new jobs created")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("copies the job link to the clipboard and shows Copied, then resets", async () => {
    const user = setupUser();
    const writeText = spyOnClipboardWriteText().mockResolvedValue(undefined);
    render(<JobsCreatedDialog isOpen jobs={jobs} onClose={jest.fn()} />);

    await user.click(screen.getAllByRole("button", { name: "Copy" })[0]);

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("/annotate-job/tok1"),
    );
    expect(await screen.findByText("Copied")).toBeInTheDocument();

    await waitFor(
      () => {
        expect(screen.getAllByRole("button", { name: "Copy" }).length).toBe(2);
      },
      { timeout: 3000 },
    );
  });

  it("ignores clipboard failures silently", async () => {
    const user = setupUser();
    const writeText = spyOnClipboardWriteText().mockRejectedValue(
      new Error("denied"),
    );
    render(<JobsCreatedDialog isOpen jobs={jobs} onClose={jest.fn()} />);

    await user.click(screen.getAllByRole("button", { name: "Copy" })[0]);
    expect(writeText).toHaveBeenCalled();
    // No "Copied" state should appear since the promise rejected.
    await waitFor(() => {
      expect(screen.queryByText("Copied")).not.toBeInTheDocument();
    });
  });

  it("renders an open-in-new-tab link with the job url", () => {
    render(<JobsCreatedDialog isOpen jobs={jobs} onClose={jest.fn()} />);
    const link = screen.getByLabelText("Open Alice's job in a new tab");
    expect(link).toHaveAttribute("href", expect.stringContaining("/annotate-job/tok1"));
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("calls onClose from the header close button, the Done button, and the backdrop, but not the panel", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(<JobsCreatedDialog isOpen jobs={jobs} onClose={onClose} />);

    await user.click(screen.getByText("Alice"));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
