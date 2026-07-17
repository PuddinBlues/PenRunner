# PenRunner — Dominio e Data Model

Spina dorsale del prodotto: entità, relazioni, stati e regole di scoring del reining (IRHA/NRHA). La versione navigabile con diagramma ER è in `data-model.html`.

Convenzione: ogni entità ha `id` (UUID) + `created_at`/`updated_at`, omessi sotto per brevità.

## Tre nuclei

- **Anagrafiche** — chi e cosa partecipa: persone, cavalli, scuderie.
- **Evento e competizione** — l'evento e le sue articolazioni: classi, pattern, manovre.
- **Iscrizione e scoring** — iscrizioni, run, punteggi, penalità.
- **Identità e accesso** — account, organizzazioni, ruoli event-scoped, sessioni, audit (vedi sotto).

Principio: tema e colore sono dati dell'evento, ma **le regole di scoring sono dati di dominio della disciplina**. Il catalogo dei pattern (cosa prevede il regolamento) è separato dai dati di una singola run (cosa ha fatto questo cavallo).

## Entità

### Anagrafiche

**Person** — rider e/o owner (un individuo può essere entrambi).
| Campo | Tipo | Note |
|-------|------|------|
| full_name | string | |
| membership_irha | string? | tessera IRHA |
| membership_fise | string? | patente FISE |
| category | enum | open · non_pro · youth · rookie |
| stable_id | uuid? (FK) | scuderia |
| locale | enum | it · en — lingua per email/notifiche (BR-62) |

**Horse** — cavallo atleta.
| Campo | Tipo | Note |
|-------|------|------|
| name | string | nome di gara |
| microchip | string | verificato all'ingresso in arena |
| ueln | string? | passaporto / UELN |
| competition_license | string? | licenza competizione IRHA |
| owner_id | uuid (FK) | Person |
| stable_id | uuid? (FK) | |

**Stable** — scuderia / centro.
| Campo | Tipo | Note |
|-------|------|------|
| name | string | |
| referent_id | uuid? (FK) | referente (Person) |

### Evento e competizione

**Event** — lo show. Porta tema cromatico e tier.
| Campo | Tipo | Note |
|-------|------|------|
| name | string | |
| venue | string | sede / circolo |
| start_date / end_date | date | |
| tier | enum | regionale · nazionale · internazionale · premium |
| theme_primary | color | colore tema |
| theme_secondary | color? | |
| hero_image | url? | foto header |
| fee_per_horse | money | default 15 € |
| status | enum | vedi stati evento |
| slot_duration_s | int | default 270 (4'30" per run, ETA) — override per Class |
| drag_every_n_runs | int | default 5 (rinnovo fondo) |
| drag_duration_s | int | default 420 (7') |
| self_scratch_enabled | bool | default true — scratch in-app da concorrente/scuderia (BR-17); off = solo organizzazione |

**Class** — classe di gara di un evento. Lega evento↔pattern e punta a una **Category ufficiale** del catalogo.
| Campo | Tipo | Note |
|-------|------|------|
| event_id | uuid (FK) | |
| category_code | string (FK→catalogo) | es. "101", "109", "110" — vedi `reference/categories.json` |
| name | string | default dal catalogo, personalizzabile (es. "Open L4 · Derby") |
| pattern_id | uuid (FK) | pattern assegnato |
| entry_fee | money | quota classe |
| added_money | money | montepremi |
| judges_count | int | 1 o più giudici |

**Category** — categoria ufficiale IRHA-FISE (catalogo di dominio, 24 voci in `reference/categories.json`, versionato per stagione): codice, campionato (debuttanti/italiano/assoluto/facoltative), patente FISE richiesta, tessere, vincolo proprietà cavallo, limiti età, earnings cap (con riferimento IRHA-EUR o NRHA-USD), obbligo tecnico federale. L'eleggibilità (BR-10, BR-13..16) si valuta contro questo catalogo. Il campo `category` di Person (open/non_pro/youth/rookie) resta come qualifica sintetica del profilo; la fonte di verità per l'iscrizione è la Category della classe.

**Pattern** — pattern ufficiale dal Patternbook IRHA. Catalogo di dominio, condiviso tra eventi, versionato per stagione. **I 20 pattern ufficiali 2026 (1–18 + A, B) sono già digitalizzati in `reference/patterns.json`** — usarlo come seed.
| Campo | Tipo | Note |
|-------|------|------|
| code | string | es. "1", "9", "A" |
| season | int | stagione di validità |
| entry_gait | enum | walk_in · trot_in · lope_in |
| trot_in_mandatable | bool | se walk_in, lo show management può imporre l'ingresso al trotto (va pubblicato; violazione → score_0) |
| restricted_to | string[]? | classi ammesse (A e B: solo Youth 10&Under / Short Stirrup) |
| maneuvers | Maneuver[] | sequenza ordinata |

**Maneuver** — manovra prevista dal pattern (definizione, non esecuzione).
| Campo | Tipo | Note |
|-------|------|------|
| pattern_id | uuid (FK) | |
| order | int | posizione nella sequenza |
| type | enum | rundown · rollback · stop (sliding stop) · backup · spin · circles · lead_change · figure_8 · hesitate |
| label | string | es. "Cerchi destra" |

Vocabolario tipi (dal patternbook): `stop` = sliding stop; `rundown` = galoppo di avvicinamento a stop/rollback; `circles` = set di cerchi in una direzione con qualificatori largo-veloce/piccolo-lento, include il cambio in uscita; `lead_change` = cambio di galoppo al centro; `figure_8` = due cerchi opposti con cambio al centro; `hesitate` = esitazione richiesta (elemento del pattern, non manovra a sé nel punteggio). Nota: i passi del patternbook (in `patterns.json`) vanno raggruppati nelle ~7–8 manovre-segnate del cartellino giudice secondo lo schema NRHA — da confermare con il giudice.

### Iscrizione e svolgimento

**Entry** — iscrizione di un binomio (cavallo + cavaliere) a una classe.
| Campo | Tipo | Note |
|-------|------|------|
| class_id | uuid (FK) | |
| horse_id | uuid (FK) | |
| rider_id | uuid (FK) | Person |
| draw_number | int? | ordine di partenza |
| status | enum | vedi stati iscrizione |

**Run** — esecuzione del pattern da un binomio, giudicata. Una entry può avere più run (go + finale). Con più giudici, una run ha più ScoreCard.
| Campo | Tipo | Note |
|-------|------|------|
| entry_id | uuid (FK) | |
| go_round | int | 1, 2, finale… |
| final_score | decimal? | **somma** delle ScoreCard valide (con scarto alto/basso a 5 giudici), calcolata |
| status | enum | vedi stati run |

**ScoreCard** — valutazione di un singolo giudice per una run.
| Campo | Tipo | Note |
|-------|------|------|
| run_id | uuid (FK) | |
| judge_id | uuid (FK) | Person (ruolo giudice) |
| run_penalty | decimal | penalità di run (≥0) |
| special | enum? | null · score_0 · no_score |
| score | decimal? | totale carta, **calcolato** |
| signed_at | datetime? | firma del giudice |

**ManeuverScore** — voto qualità e penalità di una manovra dentro una ScoreCard. Una riga per ogni manovra del pattern.
| Campo | Tipo | Note |
|-------|------|------|
| scorecard_id | uuid (FK) | |
| maneuver_id | uuid (FK) | manovra del pattern |
| quality | decimal | −1.5 … +1.5 (passo 0.5) |
| penalty | decimal | **totale** penalità manovra (≥0) |

### Identità e accesso

Principio: **account ≠ anagrafica**. `User` è l'identità con cui si entra; `Person` resta l'anagrafica, che può esistere senza account (profilo creato da una scuderia, rivendicabile via claim — che si conclude solo a email verificata). Rider/owner/referente non sono ruoli memorizzati: sono fatti dei dati (`entries.rider_id`, `horses.owner_id`, `stables.referent_id`).

**User** — identità di accesso (email + password argon2id).
| Campo | Tipo | Note |
|-------|------|------|
| email | string | unica (case-insensitive) |
| password_hash | string | argon2id |
| person_id | uuid? (FK, unico) | null finché il profilo non è creato o rivendicato |
| email_verified_at | datetime? | prerequisito del claim |
| is_platform_admin | bool | default false — staff PenRunner (BR-70); azioni sempre auditate (BR-71) |
| suspended_at / suspended_reason | datetime? / string? | sospensione admin, taglia le sessioni |

**Organization** — il club organizzatore. Il vetting vive qui: è il club a essere verificato, le persone ne ereditano le capacità.
| Campo | Tipo | Note |
|-------|------|------|
| name, affiliation_code, contatti, logo, iban | | profilo organizzazione |
| vetting_status | enum | in_verifica · verificata · respinta |
| vetting_note | string? | obbligatoria se respinta (rifiuto motivato) |
| verified_at / verified_by | datetime? / uuid? (FK User) | chi ha verificato |

**OrganizationMember** — membership con ruolo `titolare` | `segreteria` (Person ↔ Organization, unica). Creare eventi richiede membership in un'organizzazione `verificata`; `Event.organization_id` (FK, not null) lega l'evento al club.

**EventRoleAssignment** — ruolo operativo event-scoped: `giudice` | `scribe` | `segreteria`, con `class_id` opzionale (null = tutto l'evento). Si **disattiva** (`deactivated_at`), mai si cancella: la sostituzione di un giudice non tocca le ScoreCard già firmate (che referenziano Person).

**EventInvite** — invito magic-link legato a un'assegnazione: `token_hash` monouso, `expires_at`, `accepted_at`, `revoked_at`. L'accettazione NON crea uno User: apre una sessione scoped (giudice/scribe entrano in arena senza account pieno).

**Session** — sessioni server-side revocabili (cookie httpOnly): appartengono a uno User **oppure** a un EventInvite, mai a entrambi (CHECK). **AuthToken** — token monouso per verifica email e reset password (hash, scadenza, consumo).

**AuditLog** — BR-71: append-only, l'immutabilità è imposta da un trigger (no UPDATE/DELETE). Colonne: attore (User), azione, entità, `before`/`after` (jsonb), nota, timestamp. Registra le azioni admin (vetting, sospensioni) ed è la stessa struttura che traccerà le correzioni score BR-40/41.

## Relazioni (ER)

```
Stable  1──N Person          Stable 1──N Horse        Person 1──N Horse (owner)
Event   1──N Class           Pattern 1──N Maneuver    Pattern 1──N Class
Class   1──N Entry           Horse 1──N Entry         Person 1──N Entry (rider)
Entry   1──N Run             Run 1──N ScoreCard       Person 1──N ScoreCard (judge)
ScoreCard 1──N ManeuverScore Maneuver 1──N ManeuverScore

User 1──1 Person (claim)     Organization 1──N OrganizationMember (Person, ruolo)
Organization 1──N Event      Event 1──N EventRoleAssignment (Person, ruolo, classe?)
EventRoleAssignment 1──N EventInvite   Session N──1 (User | EventInvite)
User 1──N AuthToken          AuditLog N──1 User (attore)
```

## Stati (macchine a stati)

**Evento:** bozza → annunciato → iscrizioni aperte → iscrizioni chiuse → in corso → concluso
- `annunciato` = pubblico sul calendario (visibile, condivisibile) ma iscrizioni non ancora aperte. Tipico dei main event annunciati con mesi di anticipo.

**Iscrizione (Entry):** bozza → confermata → check-in → in campo → completata
- Stati terminali alternativi: `ritirata` (scratch), `assente`.

**Run:** attesa → in inserimento → in attesa firma → validata → pubblicata
- `in inserimento` supporta l'offline: la ScoreCard si compila localmente e passa a `validata` solo dopo firma + sync. Modifiche dopo la firma → evento di correzione tracciato (audit log).

## Modello di scoring

Per una singola ScoreCard (un giudice):

```
# punteggio di una manovra
maneuver_total = quality − penalty

# punteggio della carta
score = 70 + Σ(quality) − Σ(penalty_manovre) − run_penalty
```

- `quality` per manovra: −1.5 … +1.5 a passi di 0.5.
- Penalità ≥ 0.
- Score finale della run = **somma** delle ScoreCard dei giudici (con 5 giudici: esclusi il più alto e il più basso; a parità di scarto se ne esclude uno solo). Tie-break da regolamento (BR-32).

Voti qualità: +1.5 eccellente · +1 molto buono · +0.5 buono · 0 medio · −0.5 scarso · −1 molto scarso · −1.5 estremamente scarso.

### Penalità — due livelli (distinzione strutturale)

**Penalità di manovra** — appartengono a una manovra, sommate nel campo `penalty` del ManeuverScore. Una manovra può cumulare più penalità di motivi diversi, ma **lo scribe inserisce il TOTALE già sommato** per quella manovra. Valori comuni ½, 1, 2, con casi cumulativi per occorrenza (es. −1 per quarto di cerchio fuori piombo). **Non costruire cataloghi per tipo, non chiedere il motivo** — decisione di design presa con cura dopo diverse iterazioni.

**Penalità di run** — riguardano l'intera prova, nel campo `run_penalty` della ScoreCard. Valore tipico 5 punti. Separate perché non attribuibili a una manovra.

**Esiti speciali** (campo `special`, sostituiscono il punteggio):
- `score_0` — fuori pattern, ordine errato, manovre aggiunte → punteggio 0 ma in classifica.
- `no_score` — squalifica, abuso, equipaggiamento → fuori classifica.

## Classifica e payout

- **Classifica** = vista derivata. Ordina le run validate per `final_score` desc. `no_score` fuori classifica; `score_0` in fondo ma presenti. Tie-break da regolamento IRHA/NRHA.
- **Payout** = vista derivata. Distribuisce `added_money` della classe tra le posizioni a punteggio valido, secondo schema percentuale e numero di paganti.
- Entrambi **calcolati, non memorizzati** — si ricalcolano da run e iscrizioni. Evita disallineamenti quando uno score viene corretto.
- **Turno stimato (ETA)** = terza vista derivata: da start list, stato run e configurazione evento (slot, drag, pause), con ri-ancoraggio live e media mobile della cadenza osservata. Regole BR-50..55.

## Fee

Attributo dell'evento (`fee_per_horse`, default 15 €), applicato **per cavallo iscritto distinto**, indipendente dal numero di classi:

```
fee_maturata = COUNT(DISTINCT horse_id tra le entry confermate) × fee_per_horse
```

MVP: incasso all'organizzatore, che rendiconta e versa a PenRunner. La struttura è pronta per la Fase 2 (pagamento in piattaforma con split) aggiungendo un'entità `Payment` collegata all'iscrizione, senza modificare il calcolo.

## Punti aperti (validare con un giudice sul Patternbook IRHA)

- Catalogo completo dei tipi di manovra e mappatura ai pattern della stagione corrente.
- Regole di tie-break esatte per classe e circuito.
- Schema percentuale di payout per numero di paganti e livello.
- Regole di media giudici e gestione scarti con più di due giudici.
- Soglie che trasformano una penalità in `score_0` (es. over-spin oltre una frazione).
- Circuiti/campionati con punti cumulativi stagionali (entità `Standing` dedicata, probabilmente Fase 2).

Il modello regge questi casi; i **valori esatti** vanno confermati sul regolamento.
