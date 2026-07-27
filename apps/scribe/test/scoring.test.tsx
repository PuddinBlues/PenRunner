import { ScribeStore } from "@penrunner/core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Scoring } from "../src/screens/Scoring.js";
import { translator } from "../src/lib/i18n.js";
import { indexedDbAdapter } from "../src/lib/storage.js";
import type { ScoringBundle, Session } from "../src/lib/types.js";

// Interaction test del wiring schermata scoring → ScribeStore: il gesto
// dell'operatore produce lo stato corretto nello store già testato, e la
// chiusura passa dal motore (totale mostrato).

const bundle: ScoringBundle = {
  engineVersion: "1.0.0",
  selfJudgePersonId: "judge-1",
  classes: [{ id: "cls-1", name: "Open", patternId: "pat-1", eventId: "ev-1" }],
  patterns: [{ id: "pat-1", code: "6", name: "Pattern 6", entryGait: "walk_in" }],
  maneuvers: [1, 2, 3].map((n) => ({
    id: `m${n}`,
    patternId: "pat-1",
    position: n,
    labelIt: `Manovra ${n}`,
    labelEn: `Maneuver ${n}`,
  })),
  entries: [
    { id: "en-1", classId: "cls-1", horseId: "h1", riderId: "r1", drawNumber: 1, status: "confermata" },
  ],
  runs: [{ id: "run-1", entryId: "en-1", status: "attesa" }],
  judges: [{ personId: "judge-1", fullName: "Judge One", classId: null }],
  horses: { h1: "Gun Smoke" },
  riders: { r1: "M. Rossi" },
};
const session: Session = { token: "tok", eventId: "ev-1", role: "giudice" };

let store: ScribeStore;
let counter = 0;
beforeEach(async () => {
  store = await ScribeStore.open(
    indexedDbAdapter(`t-${++counter}`),
    () => crypto.randomUUID(),
    () => new Date().toISOString(),
  );
});
afterEach(cleanup);

describe("schermata scoring → store", () => {
  it("manda in campo alla prima apertura (registra l'evento run)", async () => {
    render(
      <Scoring
        t={translator("it")}
        locale="it"
        bundle={bundle}
        store={store}
        session={session}
        judgeId="judge-1"
        runId="run-1"
        onMutate={() => {}}
        onDone={() => {}}
      />,
    );
    await waitFor(() => expect(store.cardForRun("run-1", "judge-1")).toBeDefined());
    const payload = store.buildSyncPayload();
    expect(payload.events.some((e) => e.type === "sent_to_field")).toBe(true);
    // binomio in campo mostrato
    expect(screen.getByText("Gun Smoke")).toBeTruthy();
  });

  it("i voti si registrano e la chiusura è bloccata finché incompleta", async () => {
    render(
      <Scoring
        t={translator("it")}
        locale="it"
        bundle={bundle}
        store={store}
        session={session}
        judgeId="judge-1"
        runId="run-1"
        onMutate={() => {}}
        onDone={() => {}}
      />,
    );
    await waitFor(() => expect(store.cardForRun("run-1", "judge-1")).toBeDefined());
    // il bottone chiudi mostra quante manovre mancano (BR-80: dice il passo)
    expect(screen.getByText(/Mancano 3 manovre/)).toBeTruthy();

    // segno +½ sulla prima manovra di ciascuna riga
    const plusHalf = screen.getAllByText("+½");
    fireEvent.click(plusHalf[0]!);
    await waitFor(() => {
      const card = store.cardForRun("run-1", "judge-1")!;
      expect(card.maneuvers[0]!.quality).toBe(0.5);
    });
    expect(screen.getByText(/Mancano 2 manovre/)).toBeTruthy();
  });
});
