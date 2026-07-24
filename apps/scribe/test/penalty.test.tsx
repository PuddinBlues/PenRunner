import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PenaltySheet } from "../src/components/PenaltySheet.js";
import { translator } from "../src/lib/i18n.js";

afterEach(cleanup);

// Rifinitura validata col giudice: le penalità si DETTANO durante la manovra
// ("mezzo… ancora mezzo… uno") — i tocchi rapidi SOMMANO, il totale resta
// un numero unico (BR-22: niente cataloghi, niente motivi).

describe("penalità a tocchi incrementali", () => {
  it("i tocchi rapidi si sommano e la conferma scrive il totale", () => {
    const onConfirm = vi.fn();
    render(
      <PenaltySheet
        t={translator("it")}
        isRun={false}
        label="Penalità · manovra 2"
        current={0}
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("+½"));
    fireEvent.click(screen.getByText("+½"));
    fireEvent.click(screen.getByText("+1"));
    expect(screen.getByText("−2")).toBeTruthy(); // totale a video
    fireEvent.click(screen.getByText("Conferma"));
    expect(onConfirm).toHaveBeenCalledWith(2);
  });

  it("azzera riparte da zero", () => {
    const onConfirm = vi.fn();
    render(
      <PenaltySheet
        t={translator("it")}
        isRun={false}
        label="Penalità · manovra 4"
        current={0}
        onConfirm={onConfirm}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("+5"));
    fireEvent.click(screen.getByText("Azzera"));
    fireEvent.click(screen.getByText("+1"));
    fireEvent.click(screen.getByText("Conferma"));
    expect(onConfirm).toHaveBeenCalledWith(1);
  });
});
