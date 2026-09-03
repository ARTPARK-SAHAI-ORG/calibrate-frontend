import { render, screen, setupUser } from "@/test-utils";
import { SimulationConfigTab } from "../SimulationConfigTab";
import { Agent } from "@/components/AgentPicker";
import { PickerItem } from "@/components/MultiSelectPicker";

jest.mock("../../AgentPicker", () => ({
  AgentPicker: (props: {
    selectedAgentUuid: string;
    onSelectAgent: (agent: Agent | null) => void;
    label?: string;
    placeholder?: string;
    disabled?: boolean;
  }) => (
    <div data-testid="agent-picker">
      <span>{props.label}</span>
      <span>{props.placeholder}</span>
      <span>{props.disabled ? "agent-disabled" : "agent-enabled"}</span>
      <button
        onClick={() =>
          props.onSelectAgent({ uuid: "a1", name: "Agent One", verified: true })
        }
      >
        select-verified-agent
      </button>
      <button
        onClick={() =>
          props.onSelectAgent({
            uuid: "a2",
            name: "Agent Two",
            verified: false,
          })
        }
      >
        select-unverified-agent
      </button>
      <button onClick={() => props.onSelectAgent(null)}>clear-agent</button>
    </div>
  ),
}));

jest.mock("../../MultiSelectPicker", () => ({
  MultiSelectPicker: (props: {
    items: PickerItem[];
    selectedItems: PickerItem[];
    onSelectionChange: (items: PickerItem[]) => void;
    label?: string;
    placeholder?: string;
    isLoading?: boolean;
    disabled?: boolean;
  }) => (
    <div data-testid={`multiselect-${props.label}`}>
      <span>{props.placeholder}</span>
      <span>{props.isLoading ? "loading" : "idle"}</span>
      <span>{props.disabled ? "disabled" : "enabled"}</span>
      <span>{props.items.length} items available</span>
      <span>{props.selectedItems.length} selected</span>
      <button
        onClick={() =>
          props.onSelectionChange([{ uuid: "new", name: "New Item" }])
        }
      >
        change-{props.label}
      </button>
    </div>
  ),
}));

const PERSONAS: PickerItem[] = [{ uuid: "p1", name: "Persona One" }];
const SCENARIOS: PickerItem[] = [{ uuid: "s1", name: "Scenario One" }];
const EVALUATORS = [
  {
    uuid: "m1",
    name: "Metric One",
    description: "",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    evaluator_type: "conversation" as const,
  },
];

function baseProps(
  overrides: Partial<Parameters<typeof SimulationConfigTab>[0]> = {},
) {
  return {
    selectedAgent: null,
    onSelectAgent: jest.fn(),
    personas: PERSONAS,
    selectedPersonas: [],
    onPersonasChange: jest.fn(),
    personasLoading: false,
    scenarios: SCENARIOS,
    selectedScenarios: [],
    onScenariosChange: jest.fn(),
    scenariosLoading: false,
    evaluators: EVALUATORS,
    selectedEvaluatorUuids: [],
    onEvaluatorsChange: jest.fn(),
    evaluatorsLoading: false,
    onEvaluatorsRefresh: jest.fn(),
    isConfigured: false,
    isCreating: false,
    onCreateClick: jest.fn(),
    ...overrides,
  };
}

describe("SimulationConfigTab", () => {
  it("renders the agent picker and the three multi-select pickers", () => {
    render(<SimulationConfigTab {...baseProps()} />);
    expect(screen.getByTestId("agent-picker")).toBeInTheDocument();
    expect(
      screen.getByTestId("multiselect-Select personas"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("multiselect-Select scenarios"),
    ).toBeInTheDocument();
    expect(screen.getByText("Select evaluators")).toBeInTheDocument();
  });

  it("does not show the unverified warning or the connection notice by default", () => {
    render(<SimulationConfigTab {...baseProps()} />);
    expect(screen.queryByText(/needs to be verified/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Voice simulations are currently only supported/),
    ).not.toBeInTheDocument();
  });

  it("shows the unverified agent warning when selectedAgent.verified is false", () => {
    render(
      <SimulationConfigTab
        {...baseProps({
          selectedAgent: { uuid: "a2", name: "Agent Two", verified: false },
        })}
      />,
    );
    expect(screen.getByText(/needs to be verified/)).toBeInTheDocument();
  });

  it("replaces the rest of the setup with a link to the agent's connection when the agent is unverified", () => {
    render(
      <SimulationConfigTab
        {...baseProps({
          selectedAgent: { uuid: "a2", name: "Agent Two", verified: false },
        })}
      />,
    );

    const verifyLink = screen.getByRole("link", {
      name: "Verify the connection",
    });
    expect(verifyLink).toHaveAttribute("href", "/agents/a2?tab=connection");
    expect(
      screen.queryByTestId("multiselect-Select personas"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("multiselect-Select scenarios"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Select evaluators")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Create/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps the configured setup on screen when a configured simulation's agent is unverified", () => {
    render(
      <SimulationConfigTab
        {...baseProps({
          selectedAgent: { uuid: "a2", name: "Agent Two", verified: false },
          isConfigured: true,
        })}
      />,
    );

    expect(
      screen.queryByRole("link", { name: "Verify the connection" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/needs to be verified/)).toBeInTheDocument();
    expect(
      screen.getByTestId("multiselect-Select personas"),
    ).toBeInTheDocument();
  });

  it("does not show the unverified warning when selectedAgent.verified is true", () => {
    render(
      <SimulationConfigTab
        {...baseProps({
          selectedAgent: { uuid: "a1", name: "Agent One", verified: true },
        })}
      />,
    );
    expect(screen.queryByText(/needs to be verified/)).not.toBeInTheDocument();
  });

  it("shows the agent-connection voice notice when isAgentConnection is true", () => {
    render(<SimulationConfigTab {...baseProps({ isAgentConnection: true })} />);
    expect(
      screen.getByText(/Voice simulations are currently only supported/),
    ).toBeInTheDocument();
  });

  it("calls onSelectAgent with the picked agent, and with null on clear", async () => {
    const user = setupUser();
    const onSelectAgent = jest.fn();
    render(<SimulationConfigTab {...baseProps({ onSelectAgent })} />);

    await user.click(screen.getByText("select-verified-agent"));
    expect(onSelectAgent).toHaveBeenCalledWith({
      uuid: "a1",
      name: "Agent One",
      verified: true,
    });

    await user.click(screen.getByText("clear-agent"));
    expect(onSelectAgent).toHaveBeenCalledWith(null);
  });

  it("wires the personas and scenarios change callbacks independently", async () => {
    const user = setupUser();
    const onPersonasChange = jest.fn();
    const onScenariosChange = jest.fn();
    render(
      <SimulationConfigTab
        {...baseProps({
          onPersonasChange,
          onScenariosChange,
        })}
      />,
    );

    await user.click(screen.getByText("change-Select personas"));
    expect(onPersonasChange).toHaveBeenCalledWith([
      { uuid: "new", name: "New Item" },
    ]);
    expect(onScenariosChange).not.toHaveBeenCalled();

    await user.click(screen.getByText("change-Select scenarios"));
    expect(onScenariosChange).toHaveBeenCalledWith([
      { uuid: "new", name: "New Item" },
    ]);
  });

  it("passes loading flags through to the matching picker", () => {
    render(
      <SimulationConfigTab
        {...baseProps({
          personasLoading: true,
          scenariosLoading: false,
        })}
      />,
    );
    expect(screen.getByTestId("multiselect-Select personas")).toHaveTextContent(
      "loading",
    );
    expect(
      screen.getByTestId("multiselect-Select scenarios"),
    ).toHaveTextContent("idle");
  });

  it("disables all pickers and hides the Create button when isConfigured is true", () => {
    render(<SimulationConfigTab {...baseProps({ isConfigured: true })} />);
    expect(screen.getByTestId("agent-picker")).toHaveTextContent(
      "agent-disabled",
    );
    expect(screen.getByTestId("multiselect-Select personas")).toHaveTextContent(
      "disabled",
    );
    expect(
      screen.getByTestId("multiselect-Select scenarios"),
    ).toHaveTextContent("disabled");
    // The evaluators panel has nothing to add or remove once configured.
    expect(
      screen.queryByRole("button", { name: "Add evaluators" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Create")).not.toBeInTheDocument();
  });

  it("enables pickers and shows the Create button when not configured", () => {
    render(<SimulationConfigTab {...baseProps({ isConfigured: false })} />);
    expect(screen.getByTestId("agent-picker")).toHaveTextContent(
      "agent-enabled",
    );
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("disables Create when no agent, no personas, or no scenarios are selected", () => {
    render(<SimulationConfigTab {...baseProps()} />);
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("enables Create when agent, personas, and scenarios are all selected", () => {
    render(
      <SimulationConfigTab
        {...baseProps({
          selectedAgent: { uuid: "a1", name: "Agent One", verified: true },
          selectedPersonas: PERSONAS,
          selectedScenarios: SCENARIOS,
        })}
      />,
    );
    expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
  });

  it("disables Create and shows a spinner + Creating... while isCreating", () => {
    render(
      <SimulationConfigTab
        {...baseProps({
          selectedAgent: { uuid: "a1", name: "Agent One", verified: true },
          selectedPersonas: PERSONAS,
          selectedScenarios: SCENARIOS,
          isCreating: true,
        })}
      />,
    );
    const button = screen.getByRole("button", { name: /Creating/ });
    expect(button).toBeDisabled();
    expect(screen.getByText("Creating...")).toBeInTheDocument();
  });

  it("calls onCreateClick when the Create button is clicked", async () => {
    const user = setupUser();
    const onCreateClick = jest.fn();
    render(
      <SimulationConfigTab
        {...baseProps({
          selectedAgent: { uuid: "a1", name: "Agent One", verified: true },
          selectedPersonas: PERSONAS,
          selectedScenarios: SCENARIOS,
          onCreateClick,
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(onCreateClick).toHaveBeenCalledTimes(1);
  });
});
