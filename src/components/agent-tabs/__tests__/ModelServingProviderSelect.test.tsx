/**
 * The "who serves this model" picker under a model row in the compare-models
 * window. The list of companies comes from `useModelServingProviders`, which is
 * mocked here so each case controls exactly what has arrived.
 */
import { render, screen, setupUser } from "@/test-utils";
import { useModelServingProviders } from "../../../hooks";
import { ModelServingProviderSelect } from "../ModelServingProviderSelect";

// The path is relative, not "@/hooks": the alias is rewritten at build time in
// import lines only, so jest.mock never sees it.
jest.mock("../../../hooks", () => ({
  useModelServingProviders: jest.fn(),
}));

const mockHook = useModelServingProviders as jest.Mock;

type Provider = {
  slug: string;
  name: string;
  pricePerMillionInput: number | null;
};

function hookReturns(providers: Provider[], isLoading = false) {
  mockHook.mockReturnValue({ providers, isLoading });
}

const LABEL = "Who serves this model";

function renderSelect(props: Partial<{ value: string | null; disabled: boolean }> = {}) {
  const onChange = jest.fn();
  render(
    <ModelServingProviderSelect
      modelId="openai/gpt-4o"
      value={props.value ?? null}
      onChange={onChange}
      disabled={props.disabled}
    />,
  );
  return onChange;
}

describe("ModelServingProviderSelect", () => {
  beforeEach(() => {
    mockHook.mockReset();
  });

  it("draws nothing while the list is still loading and nothing has arrived", () => {
    hookReturns([], true);
    renderSelect();

    expect(screen.queryByLabelText(LABEL)).not.toBeInTheDocument();
  });

  it("draws nothing when no company serves the model", () => {
    hookReturns([]);
    renderSelect();

    expect(screen.queryByLabelText(LABEL)).not.toBeInTheDocument();
  });

  it("names the only company and does not let it be changed", () => {
    hookReturns([
      { slug: "deepinfra", name: "DeepInfra", pricePerMillionInput: 0.25 },
    ]);
    const onChange = renderSelect();

    const select = screen.getByLabelText(LABEL);
    expect(select).toBeDisabled();
    expect(select).toHaveValue("deepinfra");
    expect(
      screen.getByRole("option", { name: "DeepInfra, $0.25 per million" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Let OpenRouter choose" }),
    ).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("lists every company with what it costs", () => {
    hookReturns([
      { slug: "novita", name: "Novita", pricePerMillionInput: 0 },
      { slug: "sambanova", name: "SambaNova", pricePerMillionInput: 0.004 },
      { slug: "deepinfra", name: "DeepInfra", pricePerMillionInput: 0.25 },
      { slug: "together", name: "Together", pricePerMillionInput: null },
    ]);
    renderSelect();

    expect(screen.getByLabelText(LABEL)).toBeEnabled();
    expect(
      screen.getByRole("option", { name: "Let OpenRouter choose" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Novita, free" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", {
        name: "SambaNova, under $0.01 per million",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "DeepInfra, $0.25 per million" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Together" })).toBeInTheDocument();
  });

  it("reports the company the reader picks", async () => {
    const user = setupUser();
    hookReturns([
      { slug: "novita", name: "Novita", pricePerMillionInput: 0 },
      { slug: "deepinfra", name: "DeepInfra", pricePerMillionInput: 0.25 },
    ]);
    const onChange = renderSelect();

    await user.selectOptions(screen.getByLabelText(LABEL), "deepinfra");

    expect(onChange).toHaveBeenCalledWith("deepinfra");
  });

  it("reports nothing chosen when the reader hands the choice back to OpenRouter", async () => {
    const user = setupUser();
    hookReturns([
      { slug: "novita", name: "Novita", pricePerMillionInput: 0 },
      { slug: "deepinfra", name: "DeepInfra", pricePerMillionInput: 0.25 },
    ]);
    const onChange = renderSelect({ value: "deepinfra" });

    const select = screen.getByLabelText(LABEL);
    expect(select).toHaveValue("deepinfra");
    await user.selectOptions(select, "");

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("cannot be changed while the row itself is turned off", () => {
    hookReturns([
      { slug: "novita", name: "Novita", pricePerMillionInput: 0 },
      { slug: "deepinfra", name: "DeepInfra", pricePerMillionInput: 0.25 },
    ]);
    renderSelect({ disabled: true });

    expect(screen.getByLabelText(LABEL)).toBeDisabled();
  });
});
