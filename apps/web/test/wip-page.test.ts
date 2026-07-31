import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import WipPage from "../src/app/page.js";

// ---------------------------------------------------------------------------
// GUARDIA vetrina WIP (root penrunner.com): il deck è in mano a IRHA, chi
// visita il dominio trova SOLO questa pagina. Vincoli del titolare che non
// devono regredire: tagline presente, NESSUN badge "Presentazione per IRHA",
// NESSUN link (le superfici dell'app restano raggiungibili, mai linkate).
// ---------------------------------------------------------------------------

describe("pagina WIP alla root", () => {
  const html = renderToStaticMarkup(createElement(WipPage));

  it("mostra wordmark, tagline, prossimamente e footer", () => {
    expect(html).toContain("PenRunner");
    expect(html).toContain(
      "unica piattaforma — veloce, sicura, integrata con la federazione",
    );
    expect(html).toMatch(/Prossimamente/i);
    expect(html).toContain("TonettiMedia");
  });

  it("NIENTE badge IRHA e NIENTE link alle superfici dell'app", () => {
    expect(html).not.toMatch(/IRHA/i);
    expect(html).not.toContain("<a ");
    expect(html).not.toMatch(/href=/);
  });
});
