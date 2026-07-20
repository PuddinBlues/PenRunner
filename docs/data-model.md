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
| birth_date | date? | per i limiti d'età (BR-15); se manca → avviso, mai blocco (BR-18) |
| locale | enum | it · en — lingua per email/notifiche (BR-62) |

**StableMember** — membership Person ↔ Stable (molti-a-molti, unica sulla coppia). Il roster cavalieri: un cavaliere indipendente o multi-scuderia sta in più roster con un solo profilo. Sostituisce la vecchia `Person.stable_id` (una sola fonte di verità); "stabled at" resta invece 1-N sul cavallo.

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
| fee_per_horse | money | prezzo al cavaliere, default 15 € (BR-02) |
| platform_fee_per_horse | money? | override evento della quota PenRunner; null = quota dell'organizzazione. Solo Platform Admin, auditato (BR-02/71) |
| status | enum | vedi stati evento |
| slot_duration_s | int | default 270 (4'30" per run, ETA) — override per Class |
| drag_every_n_runs | int | default 5 (rinnovo fondo) |
| drag_duration_s | int | default 420 (7') |
| self_scratch_enabled | bool | default true — scratch in-app da concorrente/scuderia (BR-17); off = solo organizzazione |
| draw_surgery_enabled | bool | default false — chirurgia del draw pubblicato, concessa solo dal Platform Admin, auditata (BR-43) |
| sponsor_name / sponsor_image_url | string? | fascia sponsor della scoreboard (statica in MVP; upload con la UI organizzatore) |

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
| max_entries | int? | cap opzionale: classe piena = iscrizione bloccata (capienza, non eleggibilità) |
| draw_status | enum | nessuno · generato (re-draw libero) · pubblicato (solo chirurgia BR-43) |
| scheduled_order | int? | ordine di giornata (cascata ETA sulle classi successive, BR-52); l'entità schedule con orari e pause è Fase 2 |

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
| draw_number | int? | ordine di partenza — unico posto dove l'ordine vive (le Run non portano posizione); lo scratch NON lo tocca: buco mantenuto, mai ricompattato (BR-17). Distanziamento in generazione: BR-19 |
| status | enum | vedi stati iscrizione |
| tecnico_name | string? | tecnico federale indicato (BR-16); assenza → avviso, mai blocco (BR-18) |
| eligibility_warnings | jsonb? | snapshot degli avvisi alla conferma — traccia permanente (BR-18) |

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
| score | — | **mai memorizzato**: si ricalcola sempre dal motore versionato (si mostra a chiusura e firma) |
| status | enum | in_compilazione · chiusa · firmata · validata (BR-27: la chiusura annuncia, la firma ufficializza) |
| client_card_id | uuid? (unico) | idempotenza di sync: generato dal device alla creazione |
| source | enum | digital · manual_backfill (BR-28) |
| paper_ref | string? | riferimento alla carta cartacea agli atti — obbligatorio per backfill, vietato per digital (CHECK) |
| engine_version | string? | versione del motore che ha mostrato il totale alla chiusura |
| engine_mismatch | bool | totale mostrato ≠ ricalcolo server: auditato, blocca l'auto-validazione (mai silenzioso) |
| closed_at | datetime? | chiusura (annuncio, provvisorio) |
| signed_at | datetime? | firma del giudice — per backfill sempre nullo: la firma digitale non si simula (CHECK) |
| signature_stroke | text? | firma grafometrica (tratto), solo digital |
| server_received_at | datetime? | ricezione server (l'orologio del device non decide mai un conflitto) |

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
Stable  N──N Person (StableMember)   Stable 1──N Horse   Person 1──N Horse (owner)
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

**Draw (per classe):** nessuno → generato (re-draw libero) → pubblicato (congela: crea le Run, poi solo chirurgia BR-43 auditata). I marker di drag della start list sono derivati dalle run effettive, scratch esclusi (BR-51).

**Run:** attesa → in inserimento → in attesa firma → validata → pubblicata
- `in inserimento` supporta l'offline: la ScoreCard si compila localmente. `started_at` (manda in campo) è l'àncora reale dell'ETA (BR-52); `review_held_at`/`review_note` portano lo stato "Score in review" (BR-29, alzato da evento di run; la run resta in review finché tutte le carte sono chiuse e firmate).

**ScoreCard (sotto-ciclo, BR-27):** in compilazione → **chiusa** (annuncio: completezza validata, totale mostrato, sync come provvisorio) → **firmata** (batch a fine classe, con tratto; riapertura tracciata solo pre-firma) → validata. Le bozze non lasciano mai il device; dalla firma la carta è immutabile: ogni modifica è una correzione BR-40 (snapshot prima/dopo in audit = versionamento, storia interrogabile per carta).

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

- **Classifica** = vista derivata (`computeRanking` in `packages/core`). Somma multi-giudice (`combineCards`, BR-24, con scarti a 5 giudici e parità). `no_score` fuori classifica; `score_0` in fondo ma presente e **mai eligibile ai piazzamenti a premio** (BR-31 precisata — vincola il payout); run in review → riga con "Score in review" al posto del numero (BR-29, inglese in entrambe le lingue). Pari merito = posizioni condivise (1-2-2-4); la parità al **1° posto** è flaggata (`firstPlaceTie`) perché la risoluzione è umana (run-off entro 10' o co-champion). Tie Judge/manovre di riferimento delle finali: fuori MVP.
- **Provvisorio → ufficiale** (BR-42): i risultati sono provvisori fino a +30' dall'ultima run chiusa della **sezione**. **Semplificazione MVP dichiarata: sezione ≈ classe** — se la sezione regolamentare è il blocco di giornata, la finestra per classe potrebbe chiudersi prima del dovuto; rivisitabile con l'entità schedule (domanda in lista per giudice/steward). Derivato, zero scritture: alla scadenza cambia solo il derivato.
- **Payout** = vista derivata (step 7). Distribuisce `added_money` tra le posizioni a premio **eligibili** (mai score_0/no_score).
- Tutti **calcolati, non memorizzati** — si ricalcolano da run e iscrizioni. Una correzione (BR-40) propaga automaticamente (BR-41): ricalcolo gratis + notifica ai binomi con posizione cambiata, nella **lingua del destinatario** (persons.locale, BR-62).
- **Turno stimato (ETA)** = vista derivata (`computeEta`): àncora = ultimo `started_at` osservato ("manda in campo"); senza àncora → modalità "da programma" (nessun orario promesso, solo conteggio run mancanti). Cadenza osservata (media mobile) sostituisce lo slot di default (BR-52); drag sulle run effettive (BR-51). Cascata sulle classi successive via `classes.scheduled_order`. Pause di programma: Fase 2. Regole BR-50..55.
- **Live**: la vista evento (`live.eventLive`) è la **fonte comune** di pagina evento e scoreboard (flusso G: a fine go passa automaticamente a classifica del go + start list di chi entra — tutto derivato). Aggiornamento via **SSE** con tick di invalidazione (bus in-process; assunzione singola istanza API in MVP, multi-istanza → pg NOTIFY).

## Fee

Revenue split discrezionale (BR-02): due valori distinti, entrambi **per cavallo iscritto distinto**, indipendenti dal numero di classi.

- `fee_per_horse` — prezzo al cavaliere, attributo dell'evento, deciso dall'organizzatore (default e consigliato 15 €).
- `platform_fee_per_horse` — quota PenRunner: vive sull'**organizzazione** (default 15 € = nessuno split) con **override per evento**. Impostabile SOLO dal Platform Admin (mai dall'organizzatore: è il suo costo), ogni modifica in audit log (BR-71). Il margine (fee − quota) resta all'organizzatore come leva commerciale, mostrato nel wizard.

```
fee_al_cavaliere   = COUNT(DISTINCT horse_id tra le entry confermate) × fee_per_horse
rendiconto_penrunner = COUNT(DISTINCT horse_id tra le entry confermate) × platform_fee_effettiva
margine_organizzatore = fee_al_cavaliere − rendiconto_penrunner
```

Entrambe **viste derivate, mai memorizzate**. MVP: incasso all'organizzatore, che rendiconta e versa a PenRunner. La struttura è pronta per la Fase 2 (pagamento in piattaforma con split automatico) aggiungendo un'entità `Payment` collegata all'iscrizione, senza modificare il calcolo.

## Punti aperti (validare con un giudice sul Patternbook IRHA)

- Catalogo completo dei tipi di manovra e mappatura ai pattern della stagione corrente.
- Regole di tie-break esatte per classe e circuito.
- Schema percentuale di payout per numero di paganti e livello.
- Regole di media giudici e gestione scarti con più di due giudici.
- Soglie che trasformano una penalità in `score_0` (es. over-spin oltre una frazione).
- Circuiti/campionati con punti cumulativi stagionali (entità `Standing` dedicata, probabilmente Fase 2).

Il modello regge questi casi; i **valori esatti** vanno confermati sul regolamento.
