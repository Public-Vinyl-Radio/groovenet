// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/renderWithProviders";
import LogCareDialog, { type LogCareRecord } from "./LogCareDialog";

const records = (n: number): LogCareRecord[] =>
  Array.from({ length: n }, (_, i) => ({
    key: `release:rel-${i + 1}`,
    title: `Album ${i + 1}`,
    thumbnail: null,
  }));

type Props = Partial<React.ComponentProps<typeof LogCareDialog>>;

function renderDialog(props: Props = {}) {
  const onSave = props.onSave ?? vi.fn().mockResolvedValue(undefined);
  const onOpenChange = props.onOpenChange ?? vi.fn();
  const view = renderWithProviders(
    <LogCareDialog
      open
      stackNo={2}
      target={{ stack_id: 50 }}
      records={records(10)}
      count={10}
      defaultSleeve="poly-rice-paper-poly"
      {...props}
      onSave={onSave}
      onOpenChange={onOpenChange}
    />,
  );
  return { ...view, onSave, onOpenChange };
}

const dialog = () => screen.getByRole("dialog");
const toggle = (name: string) => within(dialog()).getByRole("button", { name });
const save = () => within(dialog()).getByRole("button", { name: /^SAVE FOR/ });

describe("LogCareDialog", () => {
  it("titles a stack and previews its covers and names", () => {
    renderDialog();
    expect(within(dialog()).getByText("LOG CARE · STACK 2 · 10 RECORDS")).toBeTruthy();
    expect(within(dialog()).getByText(/Album 1 · Album 2/)).toBeTruthy();
    expect(screen.queryByTestId("log-care-more")).toBeNull();
    expect(save().textContent).toBe("SAVE FOR 10 RECORDS");
  });

  it("titles an ad-hoc selection, and caps the covers with +k", () => {
    renderDialog({ stackNo: null, records: records(12), count: 12 });
    expect(within(dialog()).getByText("LOG CARE · 12 RECORDS")).toBeTruthy();
    expect(screen.getByTestId("log-care-more").textContent).toBe("+3");
  });

  it("says RECORD for one", () => {
    renderDialog({ stackNo: null, records: records(1), count: 1 });
    expect(save().textContent).toBe("SAVE FOR 1 RECORD");
  });

  it("saves a stack as a cleaning by default", async () => {
    const { user, onSave, onOpenChange } = renderDialog();
    expect(toggle("CLEANED").getAttribute("aria-pressed")).toBe("true");

    await user.click(save());

    expect(onSave).toHaveBeenCalledWith({
      stack_id: 50,
      action_types: ["cleaned"],
      occurred_at: expect.any(String),
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("saves an ad-hoc selection by copy, with several types", async () => {
    const copies = [{ copy_id: 3 }, { release_id: "rel-2" }];
    const { user, onSave } = renderDialog({ stackNo: null, target: { copies } });

    await user.click(toggle("SLEEVE CHANGE"));
    await user.click(toggle("INSPECTED"));
    await user.selectOptions(within(dialog()).getByLabelText("METHOD"), "ultrasonic");
    await user.type(within(dialog()).getByLabelText("NOTE"), "Moved to poly.");
    await user.click(save());

    expect(onSave).toHaveBeenCalledWith({
      copies,
      action_types: ["cleaned", "sleeved", "inspected"],
      occurred_at: expect.any(String),
      notes: "Moved to poly.",
      sleeve_type: "poly-rice-paper-poly",
      details: { method: "ultrasonic" },
    });
  });

  it("backdates WHEN", async () => {
    const { user, onSave } = renderDialog();
    fireEvent.change(within(dialog()).getByLabelText("WHEN"), {
      target: { value: "2026-10-20T09:30" },
    });
    await user.click(save());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ occurred_at: new Date("2026-10-20T09:30").toISOString() }),
    );
  });

  it("shows SLEEVE only with a sleeve change, starting on the default", async () => {
    const { user } = renderDialog({ defaultSleeve: "poly" });
    expect(within(dialog()).queryByLabelText("SLEEVE")).toBeNull();

    await user.click(toggle("SLEEVE CHANGE"));
    expect((within(dialog()).getByLabelText("SLEEVE") as HTMLSelectElement).value).toBe("poly");

    await user.click(toggle("SLEEVE CHANGE"));
    expect(within(dialog()).queryByLabelText("SLEEVE")).toBeNull();
  });

  it("shows METHOD only with a cleaning, and drops a chosen one without it", async () => {
    const { user, onSave } = renderDialog();
    await user.selectOptions(within(dialog()).getByLabelText("METHOD"), "vacuum");
    await user.click(toggle("INSPECTED"));
    await user.click(toggle("CLEANED"));
    expect(within(dialog()).queryByLabelText("METHOD")).toBeNull();

    await user.click(save());
    expect(onSave).toHaveBeenCalledWith({
      stack_id: 50,
      action_types: ["inspected"],
      occurred_at: expect.any(String),
    });
  });

  it("sends no method when it is not recorded", async () => {
    const { user, onSave } = renderDialog();
    expect(
      (within(dialog()).getByLabelText("METHOD") as HTMLSelectElement).selectedOptions[0]
        .textContent,
    ).toBe("Not recorded");
    await user.click(save());
    expect(onSave).toHaveBeenCalledWith(
      expect.not.objectContaining({ details: expect.anything() }),
    );
  });

  it("needs a kind of care", async () => {
    const { user, onSave } = renderDialog();
    await user.click(toggle("CLEANED"));
    await user.click(save());
    expect(within(dialog()).getByText("Choose at least one kind of care.")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();

    await user.click(toggle("REPAIRED"));
    expect(within(dialog()).queryByText("Choose at least one kind of care.")).toBeNull();
  });

  it("needs a date", async () => {
    const { user, onSave } = renderDialog();
    fireEvent.change(within(dialog()).getByLabelText("WHEN"), { target: { value: "" } });
    await user.click(save());
    expect(within(dialog()).getByText("Choose when it happened.")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(within(dialog()).getByLabelText("WHEN"), {
      target: { value: "2026-10-20T09:30" },
    });
    expect(within(dialog()).queryByText("Choose when it happened.")).toBeNull();
  });

  it("needs a sleeve for a sleeve change", async () => {
    const { user, onSave } = renderDialog();
    await user.click(toggle("SLEEVE CHANGE"));
    await user.selectOptions(within(dialog()).getByLabelText("SLEEVE"), "");
    await user.click(save());
    expect(within(dialog()).getByText("Choose the new sleeve.")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();

    await user.selectOptions(within(dialog()).getByLabelText("SLEEVE"), "paper");
    expect(within(dialog()).queryByText("Choose the new sleeve.")).toBeNull();
  });

  it("checks the body against the API's rules before sending it", async () => {
    const { user, onSave } = renderDialog({ stackNo: null, target: { copies: [] } });
    await user.click(save());
    expect(within(dialog()).getByRole("alert").textContent).toMatch(/Couldn't save/);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows an API error inline and stays open", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("The stack is not open"));
    const { user, onOpenChange } = renderDialog({ onSave });

    await user.click(save());

    expect((await within(dialog()).findByRole("alert")).textContent).toBe(
      "Couldn't save: The stack is not open",
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    await user.type(within(dialog()).getByLabelText("NOTE"), "x");
    expect(within(dialog()).queryByRole("alert")).toBeNull();
  });

  it("shows a non-Error rejection as text", async () => {
    const { user } = renderDialog({ onSave: vi.fn().mockRejectedValue("offline") });
    await user.click(save());
    expect((await within(dialog()).findByRole("alert")).textContent).toBe("Couldn't save: offline");
  });

  it("cancels", async () => {
    const { user, onOpenChange } = renderDialog();
    await user.click(within(dialog()).getByRole("button", { name: "CANCEL" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes on Escape and returns focus to LOG CARE", async () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            LOG CARE →
          </button>
          <LogCareDialog
            open={open}
            onOpenChange={setOpen}
            stackNo={2}
            target={{ stack_id: 50 }}
            records={records(2)}
            count={2}
            defaultSleeve="poly"
            onSave={vi.fn()}
          />
        </>
      );
    }
    const { user } = renderWithProviders(<Harness />);
    const trigger = screen.getByRole("button", { name: "LOG CARE →" });
    await user.click(trigger);
    await screen.findByRole("dialog");
    await waitFor(() => expect(dialog().contains(document.activeElement)).toBe(true));

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("starts fresh each time it opens", async () => {
    function Harness() {
      const [open, setOpen] = React.useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            reopen
          </button>
          <LogCareDialog
            open={open}
            onOpenChange={setOpen}
            stackNo={null}
            target={{ copies: [{ copy_id: 1 }] }}
            records={records(1)}
            count={1}
            defaultSleeve="poly"
            onSave={vi.fn()}
          />
        </>
      );
    }
    const { user } = renderWithProviders(<Harness />);
    await user.type(within(dialog()).getByLabelText("NOTE"), "draft");
    await user.click(within(dialog()).getByRole("button", { name: "CANCEL" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(screen.getByRole("button", { name: "reopen" }));
    expect(
      (within(await screen.findByRole("dialog")).getByLabelText("NOTE") as HTMLTextAreaElement)
        .value,
    ).toBe("");
  });
});
