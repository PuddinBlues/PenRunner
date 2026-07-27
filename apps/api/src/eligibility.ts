// ---------------------------------------------------------------------------
// Valutatore di eleggibilità (BR-10, 13..16) contro il catalogo categorie.
// Principio "the show must go on" (BR-18): questo modulo produce SOLO avvisi
// informativi con codice BR citabile — mai un esito bloccante, e nessun nuovo
// vincolo bloccante va mai derivato da qui, in questo step né nei prossimi.
// Un falso positivo non deve mai fermare un binomio al cancello: l'avviso è
// la checklist del check-in, l'organizzatore vede e decide.
// ---------------------------------------------------------------------------

export interface EligibilityWarning {
  code: "BR-10" | "BR-13" | "BR-14" | "BR-15" | "BR-16";
  message: string;
}

interface CategoryFacts {
  name: string;
  fiseLicense: string | null;
  membership: string | null;
  tecnicoFederaleRequired: boolean;
  horseOwnership: string;
  riderAge: unknown;
  earningsCap: unknown;
  horseEarningsCap: unknown;
}

interface RiderFacts {
  personId: string;
  membershipIrha: string | null;
  membershipFise: string | null;
  birthDate: string | null; // ISO date
}

interface HorseFacts {
  ownerId: string;
}

interface EntryFacts {
  tecnicoName: string | null;
}

interface AgeRule {
  min?: number;
  max?: number;
  rule?: string;
}

interface CapRule {
  amount?: number;
  currency?: string;
  scope?: string;
  ref?: string;
}

function formatCap(cap: CapRule): string {
  const parts = [
    cap.amount !== undefined ? `< ${cap.amount} ${cap.currency ?? ""}`.trim() : null,
    cap.scope ?? null,
    cap.ref ? `(${cap.ref})` : null,
  ].filter(Boolean);
  return parts.join(" ");
}

/**
 * Età compiuta nell'anno dell'evento (approssimazione MVP della "età valutata
 * all'iscrizione secondo la regola della categoria"; le regole di permanenza
 * fini restano nel testo `rule`, citato nell'avviso).
 */
function ageInEventYear(birthDate: string, eventYear: number): number {
  return eventYear - new Date(birthDate).getFullYear();
}

export function evaluateEligibility(
  category: CategoryFacts,
  rider: RiderFacts,
  horse: HorseFacts,
  entry: EntryFacts,
  eventYear: number,
): EligibilityWarning[] {
  const warnings: EligibilityWarning[] = [];

  // BR-10 — tessere e patenti: presenza a profilo (contenuto verificato al
  // check-in, come ratificato).
  if (category.fiseLicense && !rider.membershipFise) {
    warnings.push({
      code: "BR-10",
      message: `Patente FISE richiesta ("${category.fiseLicense}") non presente a profilo — verifica documentale al check-in.`,
    });
  }
  if (category.membership && !rider.membershipIrha) {
    warnings.push({
      code: "BR-10",
      message: `Tessera IRHA richiesta ("${category.membership}") non presente a profilo — verifica documentale al check-in.`,
    });
  }

  // BR-15 — limiti d'età.
  const age = category.riderAge as AgeRule | null;
  if (age && (age.min !== undefined || age.max !== undefined)) {
    const limits = [
      age.min !== undefined ? `min ${age.min}` : null,
      age.max !== undefined ? `max ${age.max}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    if (!rider.birthDate) {
      warnings.push({
        code: "BR-15",
        message: `La categoria ha un limite d'età (${limits}) ma la data di nascita del cavaliere non è a profilo — verifica al check-in.${age.rule ? ` Regola: ${age.rule}` : ""}`,
      });
    } else {
      const years = ageInEventYear(rider.birthDate, eventYear);
      const out =
        (age.min !== undefined && years < age.min) ||
        (age.max !== undefined && years > age.max);
      if (out) {
        warnings.push({
          code: "BR-15",
          message: `Età del cavaliere nell'anno (${years}) fuori dal limite della categoria (${limits}) — possibile permanenza da regolamento, verifica al check-in.${age.rule ? ` Regola: ${age.rule}` : ""}`,
        });
      }
    }
  }

  // BR-14 — proprietà del cavallo. L'avviso contempla sempre il caso
  // legittimo: non deve suonare come errore per iscrizioni regolari.
  const ownerIsRider = horse.ownerId === rider.personId;
  if (category.horseOwnership === "di_proprieta" && !ownerIsRider) {
    warnings.push({
      code: "BR-14",
      message:
        "Il cavallo non risulta di proprietà del cavaliere: ammesso se di famiglia stretta o con lease registrato — verifica al check-in.",
    });
  }
  if (
    !ownerIsRider &&
    (category.horseOwnership === "non_di_proprieta_per_pro_di_proprieta_per_np" ||
      category.horseOwnership === "non_di_proprieta_o_di_proprieta_per_np")
  ) {
    // Regola condizionale sulla qualifica pro/non-pro: dato che il sistema
    // non ha, quindi enuncia la regola senza fingere di valutarla (come BR-13).
    warnings.push({
      code: "BR-14",
      message:
        "Il vincolo di proprietà di questa categoria dipende dalla qualifica del cavaliere (per i non professionisti il cavallo deve essere di proprietà; famiglia stretta e lease registrato sono ammessi) — verifica al check-in.",
    });
  }

  // BR-13 — tetti di vincite: dato dichiarato dall'atleta, il sistema non lo
  // traccia in MVP. Avviso informativo che enuncia il tetto.
  const cap = category.earningsCap as CapRule | null;
  if (cap) {
    warnings.push({
      code: "BR-13",
      message: `La categoria richiede vincite ${formatCap(cap)} — dato dichiarato dall'atleta, verifica al check-in.`,
    });
  }
  const horseCap = category.horseEarningsCap as CapRule | null;
  if (horseCap) {
    warnings.push({
      code: "BR-13",
      message: `La categoria ha un tetto di vincite del cavallo ${formatCap(horseCap)} — dato dichiarato, verifica al check-in.`,
    });
  }

  // BR-16 — tecnico federale.
  if (category.tecnicoFederaleRequired && !entry.tecnicoName) {
    warnings.push({
      code: "BR-16",
      message:
        "La categoria richiede l'accompagnamento di un Tecnico Federale: indicalo sull'iscrizione — verifica al check-in.",
    });
  }

  return warnings;
}
