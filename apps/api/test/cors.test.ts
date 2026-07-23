import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL } from "./helpers.js";

// ---------------------------------------------------------------------------
// CORS: le SPA vivono su origini diverse dall'API — senza preflight verde il
// browser vero blocca tutto (scoperto pianificando la UI scuderia: la config
// esisteva solo sulla SSE). Un'unica fonte di origini per tutte le route.
// ---------------------------------------------------------------------------

process.env.DATABASE_URL = TEST_DATABASE_URL;
const { buildServer } = await import("../src/server.js");

let server: Awaited<ReturnType<typeof buildServer>>;

beforeAll(async () => {
  server = await buildServer();
  await server.ready();
});
afterAll(async () => {
  await server.close();
});

describe("CORS unificato (browser cross-origin)", () => {
  it("il preflight tRPC passa per le origini delle app", async () => {
    const res = await server.inject({
      method: "OPTIONS",
      url: "/trpc/auth.login",
      headers: {
        origin: "http://localhost:5174",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type",
      },
    });
    expect(res.statusCode).toBeLessThan(300);
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5174",
    );
    expect(String(res.headers["access-control-allow-headers"])).toMatch(
      /authorization/i,
    );
  });

  it("un'origine sconosciuta NON viene riflessa", async () => {
    const res = await server.inject({
      method: "OPTIONS",
      url: "/trpc/auth.login",
      headers: {
        origin: "https://malicious.example",
        "access-control-request-method": "POST",
      },
    });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("anche le route dei documenti rispondono con l'header", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://localhost:5175" },
    });
    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5175",
    );
  });
});
