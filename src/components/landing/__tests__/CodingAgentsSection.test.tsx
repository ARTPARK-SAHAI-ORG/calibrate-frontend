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

  it("shows the heading, the example window and what the agent can be asked for", () => {
    render(<CodingAgentsSection />);
    expect(
      screen.getByRole("heading", {
        name: "Ask your coding agent to do the work",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "My LLM judge does not agree with my reviewers often enough. Fix it.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Agreement with your reviewers: 94%"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Compare the LLM judge with people",
      }),
    ).toBeInTheDocument();
  });

  it("links to the agents documentation", () => {
    render(<CodingAgentsSection />);
    expect(screen.getByRole("link", { name: "Set it up" })).toHaveAttribute(
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
