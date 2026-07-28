// @vitest-environment jsdom
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UpdateBanner, useUpdateChecks } from "@penrunner/ui";

// Guardia BR-83 lato comportamento: il banner aggiorna SOLO al tap, e i
// check partono al ritorno in primo piano (il pezzo che mancava e teneva
// il bundle di ieri per tutta la sessione).

describe("UpdateBanner", () => {
  it("mostra il messaggio e aggiorna solo al tap", () => {
    const onUpdate = vi.fn();
    render(
      <UpdateBanner
        message="Nuova versione disponibile."
        actionLabel="Aggiorna"
        onUpdate={onUpdate}
      />,
    );
    expect(screen.getByText("Nuova versione disponibile.")).toBeTruthy();
    expect(onUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Aggiorna"));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("la nota (coda di sync dello scribe) compare solo se passata", () => {
    const { rerender } = render(
      <UpdateBanner message="m" actionLabel="a" onUpdate={() => {}} />,
    );
    expect(screen.queryByText(/coda/)).toBeNull();
    rerender(
      <UpdateBanner
        message="m"
        actionLabel="a"
        note="3 elementi in coda"
        onUpdate={() => {}}
      />,
    );
    expect(screen.getByText("3 elementi in coda")).toBeTruthy();
  });
});

describe("useUpdateChecks", () => {
  it("controlla al ritorno in primo piano e smette allo smontaggio", () => {
    const check = vi.fn();
    const { unmount } = renderHook(() => useUpdateChecks(check));
    fireEvent(window, new Event("focus"));
    expect(check).toHaveBeenCalledTimes(1);
    unmount();
    fireEvent(window, new Event("focus"));
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("senza check (SW non registrato) non cabla nulla", () => {
    renderHook(() => useUpdateChecks(undefined));
    fireEvent(window, new Event("focus")); // nessun errore = ok
  });
});
