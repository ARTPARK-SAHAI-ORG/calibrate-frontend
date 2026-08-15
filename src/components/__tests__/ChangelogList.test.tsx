import { render, screen, within } from "@/test-utils";
import { ChangelogList } from "../ChangelogList";

const MONTHS = [
  {
    month: "August 2026",
    entries: [
      {
        text: "Duplicate an agent from its own page",
        number: "363",
        url: "https://github.com/o/r/pull/363",
      },
      {
        text: "Search an agent's traces",
        number: "354",
        url: "https://github.com/o/r/pull/354",
      },
    ],
  },
  {
    month: "July 2026",
    entries: [
      {
        text: "Save an agent with Cmd+S",
        number: "284",
        url: "https://github.com/o/r/pull/284",
      },
    ],
  },
];

describe("ChangelogList", () => {
  it("shows each month with its own entries", () => {
    render(<ChangelogList months={MONTHS} />);

    expect(
      screen.getByRole("heading", { name: "August 2026" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "July 2026" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Duplicate an agent from its own page", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("links each entry to its pull request, opened in a new tab", () => {
    render(<ChangelogList months={MONTHS} />);

    const link = screen.getByRole("link", { name: "#363" });
    expect(link).toHaveAttribute("href", "https://github.com/o/r/pull/363");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("keeps an entry's link inside that entry", () => {
    render(<ChangelogList months={MONTHS} />);

    const item = screen.getByText("Save an agent with Cmd+S", {
      exact: false,
    });
    expect(
      within(item.closest("li") as HTMLElement).getByRole("link"),
    ).toHaveAttribute("href", "https://github.com/o/r/pull/284");
  });

  it("says nothing is here yet when there are no months", () => {
    render(<ChangelogList months={[]} />);

    expect(screen.getByText(/Nothing here yet/)).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
