import { render, screen, setupUser, waitFor } from "@/test-utils";
import { signOut } from "next-auth/react";
import { NewSimulationDialog } from "../NewSimulationDialog";

jest.mock("../../lib/reportError", () => ({
  reportError: jest.fn(),
}));

const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

describe("NewSimulationDialog", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = "http://127.0.0.1:8000";
    localStorage.clear();
    localStorage.setItem("access_token", "test-token");
    global.fetch = jest.fn();
    (signOut as jest.Mock).mockClear();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = originalBackendUrl;
    jest.restoreAllMocks();
  });

  it("keeps the Create button disabled until a name is entered", async () => {
    const user = setupUser();
    render(<NewSimulationDialog onClose={jest.fn()} />);

    const createButton = screen.getByRole("button", {
      name: /Create Simulation/i,
    });
    expect(createButton).toBeDisabled();

    await user.type(
      screen.getByPlaceholderText("Enter simulation name"),
      "My Sim",
    );
    expect(createButton).toBeEnabled();
    expect(screen.getByText("6/50")).toBeInTheDocument();
  });

  it("does not allow typing beyond the max length", async () => {
    const user = setupUser();
    render(<NewSimulationDialog onClose={jest.fn()} />);

    const input = screen.getByPlaceholderText(
      "Enter simulation name",
    ) as HTMLInputElement;
    const longName = "a".repeat(60);
    await user.type(input, longName);

    expect(input.value.length).toBeLessThanOrEqual(50);
  });

  it("calls onClose when clicking the backdrop", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    const { container } = render(<NewSimulationDialog onClose={onClose} />);

    await user.click(container.firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when clicking inside the dialog card", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(<NewSimulationDialog onClose={onClose} />);

    await user.click(screen.getByText("Create your simulation"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose via the Back button", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(<NewSimulationDialog onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: /Back/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("creates a simulation and calls onCreateSimulation with the new uuid", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    const onCreateSimulation = jest.fn();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ uuid: "sim-123" }),
    });

    render(
      <NewSimulationDialog
        onClose={onClose}
        onCreateSimulation={onCreateSimulation}
      />,
    );

    await user.type(
      screen.getByPlaceholderText("Enter simulation name"),
      "My Sim",
    );
    await user.click(screen.getByRole("button", { name: /Create Simulation/i }));

    await waitFor(() =>
      expect(onCreateSimulation).toHaveBeenCalledWith("sim-123"),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Creating...")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/simulations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "My Sim" }),
      }),
    );
  });

  it("shows a name-conflict error inline and does not call onClose", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 409,
      clone: function () {
        return this;
      },
      json: async () => ({ detail: "Simulation name already exists" }),
    });

    render(<NewSimulationDialog onClose={onClose} />);

    await user.type(
      screen.getByPlaceholderText("Enter simulation name"),
      "Dup",
    );
    await user.click(screen.getByRole("button", { name: /Create Simulation/i }));

    expect(
      await screen.findByText("Simulation name already exists"),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("clears the name-conflict error once the user edits the name again", async () => {
    const user = setupUser();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 409,
      clone: function () {
        return this;
      },
      json: async () => ({ detail: "Simulation name already exists" }),
    });

    render(<NewSimulationDialog onClose={jest.fn()} />);

    const input = screen.getByPlaceholderText("Enter simulation name");
    await user.type(input, "Dup");
    await user.click(screen.getByRole("button", { name: /Create Simulation/i }));
    expect(
      await screen.findByText("Simulation name already exists"),
    ).toBeInTheDocument();

    await user.type(input, "2");
    expect(
      screen.queryByText("Simulation name already exists"),
    ).not.toBeInTheDocument();
  });

  it("shows a generic error message when the request fails without a conflict", async () => {
    const user = setupUser();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      clone: function () {
        return this;
      },
      json: async () => ({}),
    });

    render(<NewSimulationDialog onClose={jest.fn()} />);

    await user.type(
      screen.getByPlaceholderText("Enter simulation name"),
      "My Sim",
    );
    await user.click(screen.getByRole("button", { name: /Create Simulation/i }));

    expect(
      await screen.findByText("Failed to create simulation"),
    ).toBeInTheDocument();
  });

  it("signs out and does not create on a 401 response", async () => {
    const user = setupUser();
    const onCreateSimulation = jest.fn();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
    });

    render(
      <NewSimulationDialog
        onClose={jest.fn()}
        onCreateSimulation={onCreateSimulation}
      />,
    );

    await user.type(
      screen.getByPlaceholderText("Enter simulation name"),
      "My Sim",
    );
    await user.click(screen.getByRole("button", { name: /Create Simulation/i }));

    await waitFor(() =>
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }),
    );
    expect(onCreateSimulation).not.toHaveBeenCalled();
  });

  it("shows a network-error message when fetch rejects", async () => {
    const user = setupUser();
    (global.fetch as jest.Mock).mockRejectedValue(new Error("Network down"));

    render(<NewSimulationDialog onClose={jest.fn()} />);

    await user.type(
      screen.getByPlaceholderText("Enter simulation name"),
      "My Sim",
    );
    await user.click(screen.getByRole("button", { name: /Create Simulation/i }));

    expect(await screen.findByText("Network down")).toBeInTheDocument();
  });

  it("shows the creating spinner while the request is in flight", async () => {
    const user = setupUser();
    let resolveFetch: (value: unknown) => void = () => {};
    (global.fetch as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    render(<NewSimulationDialog onClose={jest.fn()} />);

    await user.type(
      screen.getByPlaceholderText("Enter simulation name"),
      "My Sim",
    );
    await user.click(screen.getByRole("button", { name: /Create Simulation/i }));

    expect(await screen.findByText("Creating...")).toBeInTheDocument();

    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({ uuid: "sim-123" }),
    });
    await waitFor(() =>
      expect(screen.queryByText("Creating...")).not.toBeInTheDocument(),
    );
  });

  it("does not call onClose when onCreateSimulation is not provided, even on success", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ uuid: "sim-123" }),
    });

    render(<NewSimulationDialog onClose={onClose} />);

    await user.type(
      screen.getByPlaceholderText("Enter simulation name"),
      "My Sim",
    );
    await user.click(screen.getByRole("button", { name: /Create Simulation/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when a non-Error value is thrown", async () => {
    const user = setupUser();
    (global.fetch as jest.Mock).mockRejectedValue("boom");

    render(<NewSimulationDialog onClose={jest.fn()} />);

    await user.type(
      screen.getByPlaceholderText("Enter simulation name"),
      "My Sim",
    );
    await user.click(screen.getByRole("button", { name: /Create Simulation/i }));

    expect(
      await screen.findByText("Failed to create simulation"),
    ).toBeInTheDocument();
  });

  it("shows an error when NEXT_PUBLIC_BACKEND_URL is not set", async () => {
    const user = setupUser();
    delete process.env.NEXT_PUBLIC_BACKEND_URL;

    render(<NewSimulationDialog onClose={jest.fn()} />);

    await user.type(
      screen.getByPlaceholderText("Enter simulation name"),
      "My Sim",
    );
    await user.click(screen.getByRole("button", { name: /Create Simulation/i }));

    expect(
      await screen.findByText("BACKEND_URL environment variable is not set"),
    ).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not submit when the name is only whitespace", async () => {
    const user = setupUser();
    render(<NewSimulationDialog onClose={jest.fn()} />);

    const input = screen.getByPlaceholderText("Enter simulation name");
    await user.type(input, "   ");

    const createButton = screen.getByRole("button", {
      name: /Create Simulation/i,
    });
    expect(createButton).toBeDisabled();
  });
});
