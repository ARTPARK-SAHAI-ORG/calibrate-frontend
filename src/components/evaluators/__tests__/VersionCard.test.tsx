import { render, screen, setupUser, waitFor } from "@/test-utils";
import { VersionCard } from "../VersionCard";

// jsdom has no ResizeObserver; stub it so the component's useLayoutEffect
// doesn't throw. Tests control overflow by stubbing scrollHeight directly.
class MockResizeObserver {
  callback: () => void;
  constructor(callback: () => void) {
    this.callback = callback;
  }
  observe() {}
  disconnect() {}
}

beforeAll(() => {
  (global as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver =
    MockResizeObserver;
});

function makeVersion(overrides: Partial<Parameters<typeof VersionCard>[0]["version"]> = {}) {
  return {
    uuid: "v-1",
    version_number: 1,
    judge_model: "gpt-4o",
    system_prompt: "You are a helpful judge.",
    output_config: null,
    variables: null,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

const formatDateTime = (d: string) => `formatted:${d}`;

function setup(props: Partial<React.ComponentProps<typeof VersionCard>> = {}) {
  const onSetLive = jest.fn();
  const merged: React.ComponentProps<typeof VersionCard> = {
    version: makeVersion(),
    outputType: "binary",
    isDefault: false,
    isLive: false,
    isSettingLive: false,
    onSetLive,
    formatDateTime,
    ...props,
  };
  const utils = render(<VersionCard {...merged} />);
  return { ...utils, onSetLive, props: merged };
}

describe("VersionCard", () => {
  it("renders judge model", () => {
    setup();
    expect(screen.getByText("gpt-4o")).toBeInTheDocument();
  });

  it("shows version badge and hides it when isDefault", () => {
    setup({ isDefault: false });
    expect(screen.getByText("v1")).toBeInTheDocument();
  });

  it("hides version badge when isDefault is true", () => {
    setup({ isDefault: true });
    expect(screen.queryByText("v1")).not.toBeInTheDocument();
  });

  it("shows Current badge when isLive and not default", () => {
    setup({ isLive: true, isDefault: false });
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("does not show Current badge when not live", () => {
    setup({ isLive: false });
    expect(screen.queryByText("Current")).not.toBeInTheDocument();
  });

  it("shows Mark as current button when not live and not default", () => {
    setup({ isLive: false, isDefault: false });
    expect(screen.getByText("Mark as current")).toBeInTheDocument();
  });

  it("hides Mark as current button when isLive is true", () => {
    setup({ isLive: true, isDefault: false });
    expect(screen.queryByText("Mark as current")).not.toBeInTheDocument();
  });

  it("hides Mark as current and toggle buttons entirely when isDefault", () => {
    setup({ isDefault: true, isLive: false });
    expect(screen.queryByText("Mark as current")).not.toBeInTheDocument();
    expect(screen.queryByText("Show prompt")).not.toBeInTheDocument();
    expect(screen.queryByText("Hide prompt")).not.toBeInTheDocument();
  });

  it("shows 'Marking...' label and disables button while isSettingLive", () => {
    setup({ isLive: false, isSettingLive: true });
    const btn = screen.getByText("Marking...");
    expect(btn).toBeDisabled();
  });

  it("calls onSetLive with version uuid when Mark as current is clicked", async () => {
    const user = setupUser();
    const { onSetLive } = setup({ isLive: false });
    await user.click(screen.getByText("Mark as current"));
    expect(onSetLive).toHaveBeenCalledWith("v-1");
  });

  it("prompt is visible by default when isLive is true", () => {
    setup({ isLive: true, isDefault: false });
    expect(screen.getByText("Prompt")).toBeInTheDocument();
    expect(screen.getByText("You are a helpful judge.")).toBeInTheDocument();
  });

  it("prompt is visible by default when isDefault is true", () => {
    setup({ isDefault: true, isLive: false });
    expect(screen.getByText("Prompt")).toBeInTheDocument();
  });

  it("prompt is hidden by default when neither live nor default", () => {
    setup({ isLive: false, isDefault: false });
    expect(screen.queryByText("Prompt")).not.toBeInTheDocument();
    expect(screen.getByText("Show prompt")).toBeInTheDocument();
  });

  it("toggles prompt visibility when Show prompt / Hide prompt is clicked", async () => {
    const user = setupUser();
    setup({ isLive: false, isDefault: false });
    await user.click(screen.getByText("Show prompt"));
    expect(screen.getByText("Prompt")).toBeInTheDocument();
    expect(screen.getByText("Hide prompt")).toBeInTheDocument();
    await user.click(screen.getByText("Hide prompt"));
    expect(screen.queryByText("Prompt")).not.toBeInTheDocument();
  });

  it("updates promptVisible when isLive/isDefault props change", () => {
    const { rerender } = render(
      <VersionCard
        version={makeVersion()}
        outputType="binary"
        isDefault={false}
        isLive={false}
        isSettingLive={false}
        onSetLive={jest.fn()}
        formatDateTime={formatDateTime}
      />,
    );
    expect(screen.queryByText("Prompt")).not.toBeInTheDocument();
    rerender(
      <VersionCard
        version={makeVersion()}
        outputType="binary"
        isDefault={false}
        isLive={true}
        isSettingLive={false}
        onSetLive={jest.fn()}
        formatDateTime={formatDateTime}
      />,
    );
    expect(screen.getByText("Prompt")).toBeInTheDocument();
  });

  it("copies the prompt to clipboard and shows Copied, then reverts after timeout", async () => {
    // userEvent.setup() installs its own clipboard stub on navigator, so spy
    // on it (rather than replacing navigator.clipboard) after setup runs.
    const user = setupUser();
    const writeText = jest
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    setup({ isLive: true });

    await user.click(screen.getByText("Copy"));
    expect(writeText).toHaveBeenCalledWith("You are a helpful judge.");

    expect(await screen.findByText("Copied")).toBeInTheDocument();

    await waitFor(
      () => expect(screen.getByText("Copy")).toBeInTheDocument(),
      { timeout: 3000 },
    );
  }, 10000);

  it("renders variables section when variables are present", () => {
    setup({
      isLive: true,
      version: makeVersion({
        variables: [
          { name: "topic", description: "Topic desc", default: "weather" },
          { name: "tone" },
        ],
      }),
    });
    expect(screen.getByText("Variables")).toBeInTheDocument();
    expect(screen.getByText("{{topic}}")).toBeInTheDocument();
    expect(screen.getByText("Topic desc")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getByText("weather")).toBeInTheDocument();
    expect(screen.getByText("{{tone}}")).toBeInTheDocument();
  });

  it("does not render variables section when variables is null", () => {
    setup({ variables: undefined, version: makeVersion({ variables: null }) });
    expect(screen.queryByText("Variables")).not.toBeInTheDocument();
  });

  it("does not render variables section when variables is empty array", () => {
    setup({ version: makeVersion({ variables: [] }) });
    expect(screen.queryByText("Variables")).not.toBeInTheDocument();
  });

  it("does not render variable default block when default is absent", () => {
    setup({
      isLive: true,
      version: makeVersion({ variables: [{ name: "topic" }] }),
    });
    expect(screen.queryByText("Default")).not.toBeInTheDocument();
  });

  it("renders binary output rows with custom and default labels", () => {
    setup({
      isLive: true,
      outputType: "binary",
      version: makeVersion({
        output_config: {
          scale: [
            { value: true, name: "Correct-ish", description: "true desc" },
            { value: false, name: "", description: "false desc" },
          ],
        },
      }),
    });
    expect(screen.getByText("Output")).toBeInTheDocument();
    expect(screen.getByText("Correct-ish")).toBeInTheDocument();
    expect(screen.getByText("true desc")).toBeInTheDocument();
    expect(screen.getByText("Wrong")).toBeInTheDocument();
    expect(screen.getByText("false desc")).toBeInTheDocument();
  });

  it("renders binary output with default labels when output_config is null", () => {
    setup({
      isLive: true,
      outputType: "binary",
      version: makeVersion({ output_config: null }),
    });
    expect(screen.getByText("Correct")).toBeInTheDocument();
    expect(screen.getByText("Wrong")).toBeInTheDocument();
  });

  it("does not render binary output block when prompt is not visible", () => {
    setup({
      isLive: false,
      isDefault: false,
      outputType: "binary",
      version: makeVersion({
        output_config: { scale: [{ value: true, name: "Yes" }] },
      }),
    });
    expect(screen.queryByText("Output")).not.toBeInTheDocument();
  });

  it("renders rating output rows", () => {
    setup({
      isLive: true,
      outputType: "rating",
      version: makeVersion({
        output_config: {
          scale: [
            { value: 1, name: "Bad", description: "bad desc" },
            { value: 2, name: "Good" },
          ],
        },
      }),
    });
    expect(screen.getByText("Output")).toBeInTheDocument();
    expect(screen.getByText("Bad")).toBeInTheDocument();
    expect(screen.getByText("bad desc")).toBeInTheDocument();
    expect(screen.getByText("Good")).toBeInTheDocument();
  });

  it("does not render rating output block when scale is empty", () => {
    setup({
      isLive: true,
      outputType: "rating",
      version: makeVersion({ output_config: { scale: [] } }),
    });
    expect(screen.queryByText("Output")).not.toBeInTheDocument();
  });

  it("does not render rating output block when output_config is null", () => {
    setup({
      isLive: true,
      outputType: "rating",
      version: makeVersion({ output_config: null }),
    });
    expect(screen.queryByText("Output")).not.toBeInTheDocument();
  });

  describe("prompt overflow", () => {
    afterEach(() => {
      // restore default jsdom behavior (scrollHeight is normally 0)
      Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
        configurable: true,
        value: 0,
      });
    });

    it("shows View more / View less toggle when prompt overflows measured height", async () => {
      const user = setupUser();
      // Force scrollHeight to exceed the collapsed cap so isPromptOverflowing becomes true.
      Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
        configurable: true,
        value: 500,
      });

      setup({ isLive: true });

      expect(screen.getByText("View more")).toBeInTheDocument();
      await user.click(screen.getByText("View more"));
      expect(screen.getByText("View less")).toBeInTheDocument();
      await user.click(screen.getByText("View less"));
      expect(screen.getByText("View more")).toBeInTheDocument();
    });

    it("does not show View more when prompt does not overflow", () => {
      Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
        configurable: true,
        value: 0,
      });
      setup({ isLive: true });
      expect(screen.queryByText("View more")).not.toBeInTheDocument();
    });
  });
});
