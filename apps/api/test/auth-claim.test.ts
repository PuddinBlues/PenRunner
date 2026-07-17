import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema } from "@penrunner/db";
import { extractToken } from "../src/services/mailer.js";
import {
  registerVerifiedUser,
  setupApi,
  type TestApi,
} from "./helpers.js";

let api: TestApi;

beforeAll(async () => {
  api = await setupApi();
});

afterAll(async () => {
  await api.close();
});

describe("registrazione e verifica email", () => {
  it("register → verify → login → sessione valida", async () => {
    const anon = await api.as();
    await anon.auth.register({
      email: "rider@example.com",
      password: "password-di-test",
    });
    const token = extractToken(api.mailer.lastTo("rider@example.com")!);
    const { verified } = await anon.auth.verifyEmail({ token });
    expect(verified).toBe(true);
    const { sessionToken } = await anon.auth.login({
      email: "rider@example.com",
      password: "password-di-test",
    });
    const caller = await api.as(sessionToken);
    const { claimable } = await caller.profile.claimStatus();
    expect(claimable).toBeNull();
  });

  it("un token di verifica non si consuma due volte", async () => {
    const anon = await api.as();
    await anon.auth.register({
      email: "doppio@example.com",
      password: "password-di-test",
    });
    const token = extractToken(api.mailer.lastTo("doppio@example.com")!);
    await anon.auth.verifyEmail({ token });
    await expect(anon.auth.verifyEmail({ token })).rejects.toThrow(
      /non valido o scaduto/,
    );
  });

  it("il reset password revoca le sessioni attive", async () => {
    const { sessionToken } = await registerVerifiedUser(
      api,
      "reset@example.com",
    );
    const anon = await api.as();
    await anon.auth.requestPasswordReset({ email: "reset@example.com" });
    const token = extractToken(api.mailer.lastTo("reset@example.com")!);
    await anon.auth.resetPassword({
      token,
      newPassword: "nuova-password-lunga",
    });
    // la vecchia sessione non vale più
    const stale = await api.as(sessionToken);
    await expect(stale.profile.claimStatus()).rejects.toThrow(/UNAUTHORIZED/);
    // la nuova password sì
    const { sessionToken: fresh } = await anon.auth.login({
      email: "reset@example.com",
      password: "nuova-password-lunga",
    });
    expect(fresh).toBeTruthy();
  });
});

describe("claim del profilo (modello identità + integrazione A)", () => {
  it("il flusso legittimo: la scuderia crea il profilo, il cavaliere verificato lo rivendica", async () => {
    // La scuderia ha creato cavaliere e scuderia prima che esistesse l'account.
    const [stable] = await api.db
      .insert(schema.stables)
      .values({ name: "Quarter Ranch" })
      .returning();
    const [person] = await api.db
      .insert(schema.persons)
      .values({
        fullName: "Laura Bianchi",
        email: "laura@example.com",
        stableId: stable!.id,
      })
      .returning();

    const { sessionToken } = await registerVerifiedUser(
      api,
      "laura@example.com",
    );
    const caller = await api.as(sessionToken);
    const { claimable } = await caller.profile.claimStatus();
    expect(claimable?.personId).toBe(person!.id);

    const { personId } = await caller.profile.claimAccept();
    expect(personId).toBe(person!.id);

    // Il collegamento mantiene la relazione con la scuderia.
    const [linked] = await api.db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.id, personId));
    expect(linked!.stableId).toBe(stable!.id);
  });

  it("SICUREZZA: senza email verificata il claim è negato", async () => {
    await api.db.insert(schema.persons).values({
      fullName: "Vittima Attacco",
      email: "vittima@example.com",
    });

    // L'attaccante conosce l'email e registra un account, ma non può
    // verificarla (non ha accesso alla casella).
    const anon = await api.as();
    await anon.auth.register({
      email: "vittima@example.com",
      password: "password-attaccante",
    });
    const { sessionToken } = await anon.auth.login({
      email: "vittima@example.com",
      password: "password-attaccante",
    });
    const attacker = await api.as(sessionToken);
    await expect(attacker.profile.claimStatus()).rejects.toThrow(
      /Email non verificata/,
    );
    await expect(attacker.profile.claimAccept()).rejects.toThrow(
      /Email non verificata/,
    );

    // Il profilo resta non rivendicato.
    const [victim] = await api.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "vittima@example.com"));
    expect(victim!.personId).toBeNull();
  });

  it("un profilo già rivendicato non si rivendica di nuovo", async () => {
    // Laura ha già rivendicato il suo profilo nel test sopra; un omonimo con
    // altra email non trova nulla da rivendicare e crea un profilo nuovo.
    const { sessionToken } = await registerVerifiedUser(
      api,
      "laura.doppia@example.com",
    );
    const caller = await api.as(sessionToken);
    const { claimable } = await caller.profile.claimStatus();
    expect(claimable).toBeNull();
    const { personId } = await caller.profile.create({
      fullName: "Laura Doppia",
    });
    expect(personId).toBeTruthy();
  });

  it("persons.locale segue la scelta del profilo (BR-62)", async () => {
    const { sessionToken } = await registerVerifiedUser(api, "en@example.com");
    const caller = await api.as(sessionToken);
    const { personId } = await caller.profile.create({
      fullName: "English Rider",
      locale: "en",
    });
    const [person] = await api.db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.id, personId));
    expect(person!.locale).toBe("en");
  });
});
