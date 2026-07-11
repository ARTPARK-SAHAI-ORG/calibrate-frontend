import React from "react";
import { render, screen } from "@/test-utils";
import { SessionProvider } from "../SessionProvider";

describe("SessionProvider", () => {
  it("renders children through the NextAuth SessionProvider wrapper", () => {
    render(
      <SessionProvider>
        <div>child content</div>
      </SessionProvider>
    );

    expect(screen.getByText("child content")).toBeInTheDocument();
  });
});
