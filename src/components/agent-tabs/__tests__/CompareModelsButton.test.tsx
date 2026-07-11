import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import { CompareModelsButton } from "../CompareModelsButton";

describe("CompareModelsButton", () => {
  it("calls onClick when enabled (header size)", async () => {
    const user = setupUser();
    const onClick = jest.fn();
    render(
      <CompareModelsButton
        size="header"
        label="Compare"
        isConnectionUnverified={false}
        isBenchmarkDisabled={false}
        onClick={onClick}
      />
    );

    await user.click(screen.getByRole("button", { name: /compare/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("calls onClick when enabled (bulk size)", async () => {
    const user = setupUser();
    const onClick = jest.fn();
    render(
      <CompareModelsButton
        size="bulk"
        label="Compare"
        isConnectionUnverified={false}
        isBenchmarkDisabled={false}
        onClick={onClick}
      />
    );

    await user.click(screen.getByRole("button", { name: /compare/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick and shows connection tooltip when connection unverified", async () => {
    const user = setupUser();
    const onClick = jest.fn();
    render(
      <CompareModelsButton
        size="header"
        label="Compare"
        isConnectionUnverified={true}
        isBenchmarkDisabled={false}
        onClick={onClick}
      />
    );

    const button = screen.getByRole("button", { name: /compare/i });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(
      screen.getByText("Verify agent connection first")
    ).toBeInTheDocument();
  });

  it("does not call onClick and shows benchmark-disabled tooltip when benchmarking is off", async () => {
    const user = setupUser();
    const onClick = jest.fn();
    render(
      <CompareModelsButton
        size="header"
        label="Compare"
        isConnectionUnverified={false}
        isBenchmarkDisabled={true}
        onClick={onClick}
      />
    );

    const button = screen.getByRole("button", { name: /compare/i });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(
      screen.getByText(/turned off benchmarking models/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Verify agent connection first")
    ).not.toBeInTheDocument();
  });

  it("disables the bulk-size button and applies disabled styling", async () => {
    const user = setupUser();
    const onClick = jest.fn();
    render(
      <CompareModelsButton
        size="bulk"
        label="Compare"
        isConnectionUnverified={true}
        isBenchmarkDisabled={false}
        onClick={onClick}
      />
    );

    const button = screen.getByRole("button", { name: /compare/i });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("prioritizes the connection tooltip when both disabled reasons apply", () => {
    render(
      <CompareModelsButton
        size="header"
        label="Compare"
        isConnectionUnverified={true}
        isBenchmarkDisabled={true}
        onClick={jest.fn()}
      />
    );

    expect(
      screen.getByText("Verify agent connection first")
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/turned off benchmarking models/i)
    ).not.toBeInTheDocument();
  });
});
