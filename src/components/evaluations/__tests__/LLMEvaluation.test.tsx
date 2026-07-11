import { render, screen } from "@/test-utils";
import { LLMEvaluation } from "../LLMEvaluation";

describe("LLMEvaluation", () => {
  it("renders the LLM Tests placeholder content", () => {
    render(<LLMEvaluation />);
    expect(
      screen.getByRole("heading", { name: "LLM Tests" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Test your language model with various prompts/i),
    ).toBeInTheDocument();
  });
});
