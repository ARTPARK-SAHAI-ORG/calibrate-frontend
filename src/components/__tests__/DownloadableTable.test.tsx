import { render, screen, setupUser } from "@/test-utils";
import { DownloadableTable, type TableColumn } from "../DownloadableTable";

const columns: TableColumn[] = [
  { key: "name", header: "Name" },
  { key: "score", header: "Score", render: (value) => `${value}%` },
];

const data = [
  { name: "Alice, Bob", score: 90 },
  { name: 'Say "hi"', score: 80 },
  { name: null, score: undefined },
];

describe("DownloadableTable", () => {
  it("renders nothing when data is empty", () => {
    const { container } = render(
      <DownloadableTable columns={columns} data={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders title when provided and omits it otherwise", () => {
    const { rerender } = render(
      <DownloadableTable columns={columns} data={data} title="My Table" />,
    );
    expect(screen.getByText("My Table")).toBeInTheDocument();

    rerender(<DownloadableTable columns={columns} data={data} />);
    expect(screen.queryByText("My Table")).not.toBeInTheDocument();
  });

  it("renders headers and cell values, using custom render functions when provided", () => {
    render(<DownloadableTable columns={columns} data={data} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Score")).toBeInTheDocument();
    expect(screen.getByText("Alice, Bob")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("triggers a CSV download with the default filename when the button is clicked", async () => {
    const user = setupUser();
    if (!URL.createObjectURL) (URL as any).createObjectURL = () => "";
    if (!URL.revokeObjectURL) (URL as any).revokeObjectURL = () => {};
    const createObjectURL = jest
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:mock-url");
    const revokeObjectURL = jest
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    render(<DownloadableTable columns={columns} data={data} />);
    await user.click(screen.getByTitle("Download as CSV"));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blobArg = createObjectURL.mock.calls[0][0] as Blob;
    expect(blobArg.type).toBe("text/csv;charset=utf-8;");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    clickSpy.mockRestore();
  });

  it("uses a custom filename for the download link", async () => {
    const user = setupUser();
    if (!URL.createObjectURL) (URL as any).createObjectURL = () => "";
    if (!URL.revokeObjectURL) (URL as any).revokeObjectURL = () => {};
    jest.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    jest.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const setAttributeSpy = jest.spyOn(
      HTMLAnchorElement.prototype,
      "setAttribute",
    );
    jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(
      <DownloadableTable columns={columns} data={data} filename="custom" />,
    );
    await user.click(screen.getByTitle("Download as CSV"));

    expect(setAttributeSpy).toHaveBeenCalledWith("download", "custom.csv");

    jest.restoreAllMocks();
  });
});
