import { render, screen, setupUser, act, fireEvent } from "@/test-utils";
import { LazyAudioPlayer } from "../LazyAudioPlayer";

/**
 * jsdom's HTMLAudioElement has no real playback engine, so we stub the bits
 * LazyAudioPlayer relies on: play()/pause() resolve/mutate state synchronously
 * enough for tests, and listeners are captured so we can fire them manually to
 * simulate `loadedmetadata` / `timeupdate` / `ended` / native `play`/`pause`
 * events without a real media pipeline.
 */
class FakeAudio {
  src: string;
  currentTime = 0;
  duration = 0;
  paused = true;
  listeners: Record<string, Array<() => void>> = {};

  constructor(src: string) {
    this.src = src;
  }

  addEventListener(event: string, cb: () => void) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(cb);
  }

  removeEventListener() {}

  dispatch(event: string) {
    (this.listeners[event] || []).forEach((cb) => cb());
  }

  play() {
    this.paused = false;
    this.dispatch("play");
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
    this.dispatch("pause");
  }

  load() {}
}

let lastAudio: FakeAudio | null = null;

beforeEach(() => {
  lastAudio = null;
  (global as any).Audio = jest.fn((src: string) => {
    lastAudio = new FakeAudio(src);
    return lastAudio;
  });
});

describe("LazyAudioPlayer", () => {
  it("renders the play icon and 0:00 / 0:00 before any interaction, without allocating audio", () => {
    render(<LazyAudioPlayer src="https://example.com/a.mp3" />);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByText("0:00 / 0:00")).toBeInTheDocument();
    expect((global as any).Audio).not.toHaveBeenCalled();
  });

  it("allocates the audio element and toggles play/pause on button click", async () => {
    const user = setupUser();
    render(<LazyAudioPlayer src="https://example.com/a.mp3" />);

    await user.click(screen.getByRole("button", { name: "Play" }));
    expect((global as any).Audio).toHaveBeenCalledWith(
      "https://example.com/a.mp3",
    );
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("does not re-allocate audio on a second play press", async () => {
    const user = setupUser();
    render(<LazyAudioPlayer src="https://example.com/a.mp3" />);
    await user.click(screen.getByRole("button", { name: "Play" }));
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect((global as any).Audio).toHaveBeenCalledTimes(1);
  });

  it("updates duration and current time via loadedmetadata/timeupdate events", async () => {
    const user = setupUser();
    render(<LazyAudioPlayer src="https://example.com/a.mp3" />);
    await user.click(screen.getByRole("button", { name: "Play" }));

    act(() => {
      lastAudio!.duration = 125; // 2:05
      lastAudio!.dispatch("loadedmetadata");
      lastAudio!.currentTime = 65; // 1:05
      lastAudio!.dispatch("timeupdate");
    });

    expect(screen.getByText("1:05 / 2:05")).toBeInTheDocument();
  });

  it("resets to paused and 0:00 currentTime when the track ends", async () => {
    const user = setupUser();
    render(<LazyAudioPlayer src="https://example.com/a.mp3" />);
    await user.click(screen.getByRole("button", { name: "Play" }));

    act(() => {
      lastAudio!.duration = 10;
      lastAudio!.dispatch("loadedmetadata");
      lastAudio!.currentTime = 10;
      lastAudio!.dispatch("timeupdate");
      lastAudio!.dispatch("ended");
    });

    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByText("0:00 / 0:10")).toBeInTheDocument();
  });

  it("seeks to a ratio of duration when the track is clicked", async () => {
    const user = setupUser();
    render(<LazyAudioPlayer src="https://example.com/a.mp3" />);
    await user.click(screen.getByRole("button", { name: "Play" }));

    act(() => {
      lastAudio!.duration = 100;
      lastAudio!.dispatch("loadedmetadata");
    });

    const slider = screen.getByRole("slider", { name: "Seek" });
    jest
      .spyOn(slider, "getBoundingClientRect")
      .mockReturnValue({
        left: 0,
        right: 200,
        width: 200,
        top: 0,
        bottom: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
      } as DOMRect);

    fireEvent.click(slider, { clientX: 50 });

    // 50/200 = 0.25 of duration 100 => currentTime 25
    expect(lastAudio!.currentTime).toBe(25);
  });

  it("ignores seek clicks when duration is not yet known", async () => {
    const user = setupUser();
    render(<LazyAudioPlayer src="https://example.com/a.mp3" />);
    await user.click(screen.getByRole("button", { name: "Play" }));

    const slider = screen.getByRole("slider", { name: "Seek" });
    fireEvent.click(slider, { clientX: 50 });

    expect(lastAudio!.currentTime).toBe(0);
  });

  it("tears down the audio element and resets state when the src changes", async () => {
    const user = setupUser();
    const { rerender } = render(
      <LazyAudioPlayer src="https://example.com/a.mp3" />,
    );
    await user.click(screen.getByRole("button", { name: "Play" }));
    act(() => {
      lastAudio!.duration = 40;
      lastAudio!.dispatch("loadedmetadata");
    });
    const firstAudio = lastAudio!;
    const pauseSpy = jest.spyOn(firstAudio, "pause");

    rerender(<LazyAudioPlayer src="https://example.com/b.mp3" />);

    expect(pauseSpy).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByText("0:00 / 0:00")).toBeInTheDocument();
  });

  it("tears down the audio element on unmount", async () => {
    const user = setupUser();
    const { unmount } = render(
      <LazyAudioPlayer src="https://example.com/a.mp3" />,
    );
    await user.click(screen.getByRole("button", { name: "Play" }));
    const pauseSpy = jest.spyOn(lastAudio!, "pause");

    unmount();
    expect(pauseSpy).toHaveBeenCalled();
  });

  it("formats a negative currentTime (bad seek state) as 0:00", async () => {
    const user = setupUser();
    render(<LazyAudioPlayer src="https://example.com/a.mp3" />);
    await user.click(screen.getByRole("button", { name: "Play" }));

    act(() => {
      lastAudio!.duration = 30;
      lastAudio!.dispatch("loadedmetadata");
      lastAudio!.currentTime = -5;
      lastAudio!.dispatch("timeupdate");
    });

    expect(screen.getByText("0:00 / 0:30")).toBeInTheDocument();
  });

  it("falls back duration to 0 when loadedmetadata fires with a falsy duration", async () => {
    const user = setupUser();
    render(<LazyAudioPlayer src="https://example.com/a.mp3" />);
    await user.click(screen.getByRole("button", { name: "Play" }));

    act(() => {
      lastAudio!.duration = 0;
      lastAudio!.dispatch("loadedmetadata");
    });

    expect(screen.getByText("0:00 / 0:00")).toBeInTheDocument();
  });

  it("applies the className prop", () => {
    const { container } = render(
      <LazyAudioPlayer src="https://example.com/a.mp3" className="my-extra" />,
    );
    expect(container.firstChild).toHaveClass("my-extra");
  });
});
