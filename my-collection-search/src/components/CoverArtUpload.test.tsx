// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/toaster", () => ({ toaster: { create: toast } }));

import CoverArtUpload from "./CoverArtUpload";

const dropZone = () => screen.getByText(/Drag and drop an image here/).parentElement as HTMLElement;
const fileOf = (type: string, size = 10) => new File([new Uint8Array(size)], "cover", { type });

beforeEach(() => vi.clearAllMocks());

describe("CoverArtUpload", () => {
  it("highlights the drop zone while a file is dragged over it", () => {
    renderWithProviders(<CoverArtUpload value={null} onChange={vi.fn()} />);

    fireEvent.dragEnter(dropZone());
    expect(dropZone().textContent).toContain("Drag and drop");
    fireEvent.dragLeave(dropZone());
  });

  it("accepts a dropped image", () => {
    const onChange = vi.fn();
    renderWithProviders(<CoverArtUpload value={null} onChange={onChange} />);

    fireEvent.drop(dropZone(), { dataTransfer: { files: [fileOf("image/png")] } });

    expect(onChange).toHaveBeenCalledWith(expect.any(File));
  });

  it.each([
    [fileOf("text/plain"), "Invalid file type"],
    [fileOf("image/png", 6 * 1024 * 1024), "File too large"],
  ])("rejects a bad file with a toast", (file, title) => {
    const onChange = vi.fn();
    renderWithProviders(<CoverArtUpload value={null} onChange={onChange} />);

    fireEvent.drop(dropZone(), { dataTransfer: { files: [file] } });

    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the preview and removes it", async () => {
    const onChange = vi.fn();
    const { user } = renderWithProviders(
      <CoverArtUpload value={null} onChange={onChange} preview="/cover.png" />,
    );

    expect(screen.getByAltText("Album cover preview")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
