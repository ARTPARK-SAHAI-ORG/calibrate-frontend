import { render, screen, setupUser } from "@/test-utils";
import { useRouter } from "next/navigation";
import {
  LoadingState,
  ErrorState,
  NotFoundState,
  EmptyState,
  ResourceState,
} from "../LoadingState";

describe("LoadingState", () => {
  it("renders a spinner", () => {
    const { container } = render(<LoadingState />);
    expect(container.querySelector("svg.animate-spin")).toBeInTheDocument();
  });

  it("applies an extra className", () => {
    const { container } = render(<LoadingState className="extra-class" />);
    expect(container.firstChild).toHaveClass("extra-class");
  });
});

describe("ErrorState", () => {
  it("renders the error message", () => {
    render(<ErrorState message="Something broke" />);
    expect(screen.getByText("Something broke")).toBeInTheDocument();
  });

  it("does not render a retry button when onRetry is not provided", () => {
    render(<ErrorState message="Something broke" />);
    expect(screen.queryByText("Retry")).not.toBeInTheDocument();
  });

  it("renders and calls onRetry when provided", async () => {
    const user = setupUser();
    const onRetry = jest.fn();
    render(<ErrorState message="Something broke" onRetry={onRetry} />);
    const retryButton = screen.getByText("Retry");
    await user.click(retryButton);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("applies an extra className", () => {
    const { container } = render(
      <ErrorState message="Something broke" className="extra-class" />
    );
    expect(container.firstChild).toHaveClass("extra-class");
  });
});

describe("NotFoundState", () => {
  it("renders the default 404 content", () => {
    render(<NotFoundState />);
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText("Not Found")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The page you are looking for does not exist or may have been moved"
      )
    ).toBeInTheDocument();
  });

  it("renders 401 content", () => {
    render(<NotFoundState errorCode={401} />);
    expect(screen.getByText("401")).toBeInTheDocument();
    expect(screen.getAllByText("Access Denied").length).toBeGreaterThan(0);
  });

  it("renders 403 content", () => {
    render(<NotFoundState errorCode={403} />);
    expect(screen.getByText("403")).toBeInTheDocument();
    expect(screen.getAllByText("Access Denied").length).toBeGreaterThan(0);
  });

  it("navigates to /agents when the button is clicked", async () => {
    const user = setupUser();
    const router = useRouter();
    render(<NotFoundState />);
    await user.click(screen.getByRole("button", { name: "Go to home" }));
    expect(router.push).toHaveBeenCalledWith("/agents");
  });

  it("applies an extra className", () => {
    const { container } = render(<NotFoundState className="extra-class" />);
    expect(container.firstChild).toHaveClass("extra-class");
  });
});

describe("EmptyState", () => {
  it("renders icon, title, and description", () => {
    render(
      <EmptyState
        icon={<span data-testid="empty-icon">icon</span>}
        title="No agents yet"
        description="Create your first agent to get started"
      />
    );
    expect(screen.getByTestId("empty-icon")).toBeInTheDocument();
    expect(screen.getByText("No agents yet")).toBeInTheDocument();
    expect(
      screen.getByText("Create your first agent to get started")
    ).toBeInTheDocument();
  });

  it("does not render an action button when action is not provided", () => {
    render(
      <EmptyState
        icon={<span>icon</span>}
        title="No agents yet"
        description="Create your first agent"
      />
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders and calls the action button when provided", async () => {
    const user = setupUser();
    const onClick = jest.fn();
    render(
      <EmptyState
        icon={<span>icon</span>}
        title="No agents yet"
        description="Create your first agent"
        action={{ label: "Create agent", onClick }}
      />
    );
    const button = screen.getByRole("button", { name: "Create agent" });
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies an extra className", () => {
    const { container } = render(
      <EmptyState
        icon={<span>icon</span>}
        title="No agents yet"
        description="Create your first agent"
        className="extra-class"
      />
    );
    expect(container.firstChild).toHaveClass("extra-class");
  });
});

describe("ResourceState", () => {
  const emptyState = {
    icon: <span>icon</span>,
    title: "No items",
    description: "Nothing here yet",
  };

  it("renders LoadingState when isLoading is true", () => {
    const { container } = render(
      <ResourceState
        isLoading
        error={null}
        isEmpty={false}
        emptyState={emptyState}
      >
        <div>children</div>
      </ResourceState>
    );
    expect(container.querySelector("svg.animate-spin")).toBeInTheDocument();
    expect(screen.queryByText("children")).not.toBeInTheDocument();
  });

  it("renders ErrorState when error is set", () => {
    render(
      <ResourceState
        isLoading={false}
        error="Failed to load"
        isEmpty={false}
        emptyState={emptyState}
      >
        <div>children</div>
      </ResourceState>
    );
    expect(screen.getByText("Failed to load")).toBeInTheDocument();
    expect(screen.queryByText("children")).not.toBeInTheDocument();
  });

  it("passes onRetry through to ErrorState", async () => {
    const user = setupUser();
    const onRetry = jest.fn();
    render(
      <ResourceState
        isLoading={false}
        error="Failed to load"
        isEmpty={false}
        onRetry={onRetry}
        emptyState={emptyState}
      >
        <div>children</div>
      </ResourceState>
    );
    await user.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders EmptyState when isEmpty is true", () => {
    render(
      <ResourceState
        isLoading={false}
        error={null}
        isEmpty={true}
        emptyState={emptyState}
      >
        <div>children</div>
      </ResourceState>
    );
    expect(screen.getByText("No items")).toBeInTheDocument();
    expect(screen.queryByText("children")).not.toBeInTheDocument();
  });

  it("renders children when not loading, no error, and not empty", () => {
    render(
      <ResourceState
        isLoading={false}
        error={null}
        isEmpty={false}
        emptyState={emptyState}
      >
        <div>children</div>
      </ResourceState>
    );
    expect(screen.getByText("children")).toBeInTheDocument();
  });
});
