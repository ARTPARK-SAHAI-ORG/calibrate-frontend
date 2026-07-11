import { render, screen, setupUser } from "@/test-utils";
import { NotFoundPage } from "../NotFoundPage";

const pushMock = jest.fn();

jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("../AppLayout", () => ({
  __esModule: true,
  AppLayout: ({
    activeItem,
    onItemChange,
    sidebarOpen,
    onSidebarToggle,
    customHeader,
    children,
  }: any) => (
    <div>
      <div data-testid="active-item">{activeItem}</div>
      <div data-testid="sidebar-open">{String(sidebarOpen)}</div>
      <button onClick={() => onItemChange("tools")}>nav-tools</button>
      <button onClick={onSidebarToggle}>toggle-sidebar</button>
      {customHeader}
      {children}
    </div>
  ),
}));

jest.mock("../ui", () => ({
  __esModule: true,
  NotFoundState: ({ errorCode }: { errorCode: string }) => (
    <div data-testid="not-found-state">{errorCode}</div>
  ),
}));

describe("NotFoundPage", () => {
  afterEach(() => {
    pushMock.mockClear();
  });

  it("renders AppLayout with the given activeItem, sidebar state, and NotFoundState", () => {
    render(
      <NotFoundPage
        activeItem="agents"
        errorCode={404}
        sidebarOpen={true}
        onSidebarToggle={jest.fn()}
      />,
    );

    expect(screen.getByTestId("active-item")).toHaveTextContent("agents");
    expect(screen.getByTestId("sidebar-open")).toHaveTextContent("true");
    expect(screen.getByTestId("not-found-state")).toHaveTextContent("404");
  });

  it("renders the optional customHeader", () => {
    render(
      <NotFoundPage
        activeItem="agents"
        errorCode={403}
        sidebarOpen={false}
        onSidebarToggle={jest.fn()}
        customHeader={<div data-testid="custom-header">Back</div>}
      />,
    );
    expect(screen.getByTestId("custom-header")).toBeInTheDocument();
    expect(screen.getByTestId("not-found-state")).toHaveTextContent("403");
  });

  it("navigates via router.push when onItemChange fires", async () => {
    const user = setupUser();
    render(
      <NotFoundPage
        activeItem="agents"
        errorCode={404}
        sidebarOpen={true}
        onSidebarToggle={jest.fn()}
      />,
    );
    await user.click(screen.getByText("nav-tools"));
    expect(pushMock).toHaveBeenCalledWith("/tools");
  });

  it("calls onSidebarToggle when triggered", async () => {
    const user = setupUser();
    const onSidebarToggle = jest.fn();
    render(
      <NotFoundPage
        activeItem="agents"
        errorCode={404}
        sidebarOpen={true}
        onSidebarToggle={onSidebarToggle}
      />,
    );
    await user.click(screen.getByText("toggle-sidebar"));
    expect(onSidebarToggle).toHaveBeenCalledTimes(1);
  });
});
