# ART. 15 — Premi, Montepremi, Added Money, Jackpot
**Fonte: Regolamento di Disciplina Reining FISE/IRHA 2025, pagg. 45-46 (verbatim) — digitalizzato il 2026-07-24**

## MONTEPREMI – ADDED MONEY FISE/IRHA (testo integrale)
> Il montepremi è costituito dalla somma delle iscrizioni più l'Added Money, detratto il costo
> dei trofei e una percentuale del 20% per spese organizzative. Nell'eventualità di categorie
> con meno di quattro partecipanti non si dovrà detrarre il costo del trofeo.
> Il montepremi così costituito, al netto di eventuali ritenute fiscali previste da legge, verrà
> suddiviso secondo tabelle allegate. (non sarà possibile utilizzare altri metodi per la
> distribuzione del montepremi)
> Per tutte le competizioni sarà utilizzato il Payback A.
> Gli adempimenti fiscali saranno a carico dei comitati organizzatori.

**Mappatura sul motore (`computePurse`):** formula CONFERMATA — iscrizioni + added_money
− trofei − 20%; regola <4 partecipanti già implementata; Payback A obbligatorio (digitalizzato
in `payback-schedules.json`).
**Unica ambiguità residua:** "una percentuale del 20%" non precisa la base — sole iscrizioni
(implementazione attuale) o iscrizioni+added money. È un parametro (`orgExpenseRate` sulla
base scelta): da precisare con la segreteria IRHA. Le tabelle NON sono allegate al PDF
(rimandano al software in dotazione): conferma Payback A = NRHA Schedule A resta alla segreteria.

## PREMI
> Non è possibile distribuire rimborsi spese o premi solo ai primi classificati. Chi avesse
> intenzione di distribuire denaro (buoni carburante, ricariche tel, buoni spesa sono considerati
> denaro aggiunto) lo potrà fare solo programmando un Added Money ed è fatto d'obbligo
> distribuire i premi secondo le tabelle ufficiali.

## JACKPOT
> Gara senza Added Money, il Comitato Organizzatore può decidere la percentuale delle
> iscrizioni da distribuire come montepremi secondo la Tabella di riferimento.

→ Modalità di gara distinta (purse = % iscrizioni a scelta del comitato, secondo tabella): **Fase 2**.

## Special Events e gare NRHA
> La distribuzione del montepremi per gli Special Events approvati NRHA sarà specificata nei
> relativi programmi e regolamenti. [conferma BR-34: accesso/distribuzione da conditions]
> Gare NRHA all ages: distribuzione come da Rulebook NRHA al netto delle ritenute fiscali.

## Altri vincoli utili (sezione gare regionali, pag. 29-30)
- Iscrizione alle categorie regionali: **max 30,00 € a categoria** (possibile warning BR-18 nel wizard).
- Senza Added Money: possibile **Judge Fee ≤ 5,00 €** (tipo di quota non modellato — gap noto, non bloccante).
- **Senza Added Money non vi è obbligo di distribuzione del montepremi.**
- Trofei/targhe (gare non-NRHA): importo scalabile dal montepremi **max 75,00 € IVA compresa**, uguale per tutte le tappe (validazione possibile su `trophy_cost`).
- I montepremi regionali vanno distribuiti a **tutti i partecipanti senza restrizioni di residenza sportiva** (norma anti-discriminazione territoriale — nessun impatto sul motore).
- Qualificazione campionato (Fase 2 standings): 0 vale come tappa disputata; scratch NO (salvo assenza documentata dal veterinario); no score SÌ salvo diversa valutazione del comitato.
