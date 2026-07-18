import { render, screen } from "@/test-utils";
import { VerifyToRunMessage } from "../VerifyToRunMessage";

describe("VerifyToRunMessage", () => {
  it("shows the unverified prompt with the agent name when there is no error", () => {
    render(
      <VerifyToRunMessage
        agentName="Support Bot"
        error={null}
        sampleResponse={null}
      />,
    );
    expect(
      screen.getByText(/is not verified yet/),
    ).toHaveTextContent("Support Bot");
    expect(screen.queryByText("Verification failed")).not.toBeInTheDocument();
  });

  it("shows the error and the sample response when verification failed", () => {
    render(
      <VerifyToRunMessage
        agentName="Support Bot"
        error="Connection refused"
        sampleResponse={{ status: 500, body: "oops" }}
      />,
    );
    expect(screen.getByText("Verification failed")).toBeInTheDocument();
    expect(screen.getByText("Connection refused")).toBeInTheDocument();
    expect(screen.getByText(/"status": 500/)).toBeInTheDocument();
    expect(screen.getByText(/"body": "oops"/)).toBeInTheDocument();
  });

  it("omits the sample response block when none is provided", () => {
    render(
      <VerifyToRunMessage
        agentName="Support Bot"
        error="Connection refused"
        sampleResponse={null}
      />,
    );
    expect(screen.getByText("Connection refused")).toBeInTheDocument();
    expect(document.querySelector("pre")).toBeNull();
  });
});
