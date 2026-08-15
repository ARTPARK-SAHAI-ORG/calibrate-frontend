import { render, screen, setupUser, waitFor } from "@/test-utils";
import { CodingAgentsSection, installCommand } from "../CodingAgentsSection";

describe("CodingAgentsSection", () => {
  const originalDocsUrl = process.env.NEXT_PUBLIC_DOCS_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_DOCS_URL = "https://docs.example.com";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_DOCS_URL = originalDocsUrl;
  });

  it("shows the heading and all three worked examples", () => {
    render(<CodingAgentsSection />);
    expect(
      screen.getByRole("heading", {
        name: "Use Calibrate inside your favourite AI tool",
      }),
    ).toBeInTheDocument();

    expect(screen.getByText("/onboard")).toBeInTheDocument();
    expect(
      screen.getByText("Ran them: 18 passed, 6 failed"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Which tests failed last time, and what should I change?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ran the tests again: 23 of 24 passed"),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "My LLM judge does not agree with my experts often enough. Fix it.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Agreement with your experts: 94%"),
    ).toBeInTheDocument();
  });

  it("lists what else the agent can be asked for", () => {
    render(<CodingAgentsSection />);
    expect(
      screen.getByRole("heading", {
        name: "Collect labels from your experts",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Find the best model for your agent" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Turn a spreadsheet you already have into tests",
      }),
    ).toBeInTheDocument();
  });

  it("names the picked agent on every example window", async () => {
    const user = setupUser();
    render(<CodingAgentsSection />);
    // One window per example, each titled with the agent the reader picked.
    expect(screen.getAllByText("Claude Code")).toHaveLength(4); // 3 windows + the picker
    await user.click(screen.getByRole("button", { name: "Windsurf" }));
    expect(screen.getAllByText("Windsurf")).toHaveLength(4);
  });

  it("links to the agents documentation", () => {
    render(<CodingAgentsSection />);
    expect(screen.getByRole("link", { name: "Read the docs" })).toHaveAttribute(
      "href",
      "https://docs.example.com/agents/overview",
    );
  });

  it("swaps the install command and the window name when another agent is picked", async () => {
    const user = setupUser();
    render(<CodingAgentsSection />);

    expect(screen.getByText(installCommand("claude-code"))).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cursor" }));

    expect(screen.getByText(installCommand("cursor"))).toBeInTheDocument();
    expect(
      screen.queryByText(installCommand("claude-code")),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cursor" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Claude Code" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("copies the command for the picked agent and returns the button to Copy", async () => {
    // setupUser() installs its own clipboard stub, so it must run before we
    // override navigator.clipboard.
    const user = setupUser();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<CodingAgentsSection />);
    await user.click(screen.getByRole("button", { name: "Codex" }));
    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledWith(installCommand("codex"));
    expect(
      await screen.findByRole("button", { name: "Copied" }),
    ).toBeInTheDocument();

    await waitFor(
      () =>
        expect(
          screen.getByRole("button", { name: "Copy" }),
        ).toBeInTheDocument(),
      { timeout: 3000 },
    );
  }, 10000);

  it("drops the copied state when the agent changes", async () => {
    const user = setupUser();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
      configurable: true,
    });

    render(<CodingAgentsSection />);
    await user.click(screen.getByRole("button", { name: "Copy" }));
    await screen.findByRole("button", { name: "Copied" });

    await user.click(screen.getByRole("button", { name: "Windsurf" }));

    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("keeps the button on Copy when the browser blocks the clipboard", async () => {
    const user = setupUser();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: jest.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });

    render(<CodingAgentsSection />);
    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });
});
