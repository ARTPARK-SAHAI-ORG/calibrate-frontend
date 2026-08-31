import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import { waitFor } from "@testing-library/react";
import { EditableRunName } from "../EditableRunName";

const useAccessTokenMock = jest.fn(() => "test-token");
jest.mock("../../hooks", () => ({
  __esModule: true,
  useAccessToken: () => useAccessTokenMock(),
}));

const signOutMock = jest.fn();
jest.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

const toastErrorMock = jest.fn();
jest.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
}));

jest.mock("../../lib/reportError", () => ({
  reportError: jest.fn(),
}));

const BACKEND_URL = "http://backend.test";

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: async () => body };
}

describe("EditableRunName", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND_URL;
    (global.fetch as unknown) = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("shows the run's name the way the app says it", () => {
    render(
      <EditableRunName
        taskId="task-1"
        type="llm-unit-test"
        name="Run 3"
        onRenamed={jest.fn()}
      />,
    );

    expect(screen.getByText("Evaluation run 3")).toBeInTheDocument();
  });

  it("saves a new name on Enter and reports back what it now reads", async () => {
    const user = setupUser();
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ task_id: "task-1", name: "Regression before v2" }),
    );
    const onRenamed = jest.fn();

    render(
      <EditableRunName
        taskId="task-1"
        type="llm-unit-test"
        name="Run 3"
        onRenamed={onRenamed}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Rename" }));
    const input = screen.getByLabelText("Run name");
    expect(input).toHaveValue("Evaluation run 3");
    await user.clear(input);
    await user.type(input, "Regression before v2{Enter}");

    await waitFor(() =>
      expect(onRenamed).toHaveBeenCalledWith("Regression before v2"),
    );
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe(`${BACKEND_URL}/agent-tests/run/task-1/name`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ name: "Regression before v2" });
  });

  it("clears the name back to the automatic one when the box is emptied", async () => {
    const user = setupUser();
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ task_id: "task-1", name: "Benchmark 2" }),
    );
    const onRenamed = jest.fn();

    render(
      <EditableRunName
        taskId="task-1"
        type="llm-benchmark"
        name="Nightly models"
        onRenamed={onRenamed}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Rename" }));
    await user.clear(screen.getByLabelText("Run name"));
    await user.type(screen.getByLabelText("Run name"), "{Enter}");

    await waitFor(() => expect(onRenamed).toHaveBeenCalledWith("Benchmark 2"));
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ name: null });
  });

  it("saves with the Save button", async () => {
    const user = setupUser();
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse({ task_id: "task-1", name: "Nightly models" }),
    );
    const onRenamed = jest.fn();

    render(
      <EditableRunName
        taskId="task-1"
        type="llm-benchmark"
        name="Benchmark 2"
        onRenamed={onRenamed}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Rename" }));
    expect(screen.getByText("Rename the model comparison")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Run name"));
    await user.type(screen.getByLabelText("Run name"), "Nightly models");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onRenamed).toHaveBeenCalledWith("Nightly models"),
    );
    expect(screen.queryByLabelText("Run name")).not.toBeInTheDocument();
  });

  it("closes without saving when Cancel is clicked", async () => {
    const user = setupUser();
    const onRenamed = jest.fn();

    render(
      <EditableRunName
        taskId="task-1"
        type="llm-unit-test"
        name="Run 3"
        onRenamed={onRenamed}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Rename" }));
    await user.type(screen.getByLabelText("Run name"), " and more");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Run name")).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(onRenamed).not.toHaveBeenCalled();
  });

  it("leaves the name alone on Escape", async () => {
    const user = setupUser();
    const onRenamed = jest.fn();

    render(
      <EditableRunName
        taskId="task-1"
        type="llm-unit-test"
        name="Run 3"
        onRenamed={onRenamed}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Rename" }));
    await user.type(
      screen.getByLabelText("Run name"),
      "Something else{Escape}",
    );

    await waitFor(() =>
      expect(screen.getByText("Evaluation run 3")).toBeInTheDocument(),
    );
    expect(global.fetch).not.toHaveBeenCalled();
    expect(onRenamed).not.toHaveBeenCalled();
  });

  it("sends nothing when the name was not changed", async () => {
    const user = setupUser();

    render(
      <EditableRunName
        taskId="task-1"
        type="llm-unit-test"
        name="Run 3"
        onRenamed={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Rename" }));
    await user.type(screen.getByLabelText("Run name"), "{Enter}");

    await waitFor(() =>
      expect(screen.getByText("Evaluation run 3")).toBeInTheDocument(),
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows one message when the rename fails", async () => {
    const user = setupUser();
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({}, false, 404));
    const onRenamed = jest.fn();

    render(
      <EditableRunName
        taskId="task-1"
        type="llm-unit-test"
        name="Run 3"
        onRenamed={onRenamed}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Rename" }));
    await user.clear(screen.getByLabelText("Run name"));
    await user.type(screen.getByLabelText("Run name"), "New name{Enter}");

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Could not rename the run. Please try again.",
      ),
    );
    expect(onRenamed).not.toHaveBeenCalled();
    // The box stays up with the typed name in it, so it can be sent again.
    expect(screen.getByLabelText("Run name")).toHaveValue("New name");
  });

  it("signs the user out when the session has expired", async () => {
    const user = setupUser();
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({}, false, 401));

    render(
      <EditableRunName
        taskId="task-1"
        type="llm-unit-test"
        name="Run 3"
        onRenamed={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Rename" }));
    await user.clear(screen.getByLabelText("Run name"));
    await user.type(screen.getByLabelText("Run name"), "New name{Enter}");

    await waitFor(() =>
      expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/login" }),
    );
  });
});
