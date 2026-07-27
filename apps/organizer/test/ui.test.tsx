import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Badge, Confirm, Empty } from "../src/components/Ui.js";
import { translator } from "../src/lib/i18n.js";

afterEach(cleanup);

describe("componenti UI", () => {
  it("la conferma è informativa: spiega l'effetto e chiama i callback", () => {
    const t = translator("it");
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <Confirm
        t={t}
        title="Pubblicare il draw?"
        body="La pubblicazione congela l'ordine e crea le run."
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText(/congela l'ordine/)).toBeTruthy();
    fireEvent.click(screen.getByText("Conferma"));
    expect(onConfirm).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText("Annulla"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("badge e stato vuoto", () => {
    render(
      <>
        <Badge tone="green">ok</Badge>
        <Empty>Nessun evento. Crea il primo.</Empty>
      </>,
    );
    expect(screen.getByText("ok").className).toContain("green");
    expect(screen.getByText(/Crea il primo/)).toBeTruthy();
  });
});
