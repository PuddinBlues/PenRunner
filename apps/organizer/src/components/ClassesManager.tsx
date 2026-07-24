import { useCallback, useEffect, useState } from "react";
import { navigate } from "../App.js";
import { Badge, Empty, errorMessage } from "./Ui.js";
import type { Client } from "../lib/api.js";
import type { T } from "../lib/i18n.js";

type Catalog = {
  categories: Awaited<ReturnType<Client["catalog"]["categories"]["query"]>>;
  patterns: Awaited<ReturnType<Client["catalog"]["patterns"]["query"]>>;
};
type ClassRow = Awaited<
  ReturnType<Client["classes"]["listByEvent"]["query"]>
>[number];

/**
 * Gestione classi: catalogo ufficiale → Class dell'evento. Condiviso tra
 * wizard (passo 2) e dettaglio evento. `manage` = link alla pagina classe.
 */
export function ClassesManager({
  t,
  client,
  eventId,
  manage,
}: {
  t: T;
  client: Client;
  eventId: string;
  manage?: boolean;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [rows, setRows] = useState<ClassRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<{ code: string; message: string }[]>([]);

  const [categoryId, setCategoryId] = useState("");
  const [patternId, setPatternId] = useState("");
  const [name, setName] = useState("");
  const [entryFee, setEntryFee] = useState("100");
  const [addedMoney, setAddedMoney] = useState("0");
  const [trophyCost, setTrophyCost] = useState("0");
  const [judgesCount, setJudgesCount] = useState(1);
  const [trotIn, setTrotIn] = useState(false);
  const [maxEntries, setMaxEntries] = useState("");

  const reload = useCallback(async () => {
    try {
      setRows(await client.classes.listByEvent.query({ eventId }));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [client, eventId]);

  useEffect(() => {
    void (async () => {
      try {
        const [categories, patterns] = await Promise.all([
          client.catalog.categories.query(),
          client.catalog.patterns.query(),
        ]);
        setCatalog({ categories, patterns });
        setCategoryId(categories[0]?.id ?? "");
        setPatternId(patterns[0]?.id ?? "");
      } catch (err) {
        setError(errorMessage(err));
      }
      await reload();
    })();
  }, [client, reload]);

  if (!catalog) return <p className="muted">{t("app.loading")}</p>;

  const pattern = catalog.patterns.find((p) => p.id === patternId);

  return (
    <div>
      {rows.length === 0 ? (
        <Empty>{t("classes.empty")}</Empty>
      ) : (
        <table className="tbl" style={{ marginBottom: 16 }}>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.name}</strong>
                  <div className="muted">
                    {row.categoryCode} · Pattern {row.patternCode} ·{" "}
                    {row.judgesCount} {t("classes.judges").toLowerCase()}
                  </div>
                </td>
                <td className="num">
                  {row.entryFee} € · AM {row.addedMoney} €
                </td>
                <td>
                  <Badge tone={row.drawStatus === "pubblicato" ? "green" : undefined}>
                    {row.drawStatus === "nessuno"
                      ? t("classes.entries", { n: row.entriesCount })
                      : `${t("common.draw")}: ${row.drawStatus}`}
                  </Badge>
                </td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {manage && (
                    <button
                      className="btn small"
                      onClick={() => navigate(`/event/${eventId}/class/${row.id}`)}
                    >
                      {t("classes.open")}
                    </button>
                  )}{" "}
                  <button
                    className="btn small danger"
                    onClick={async () => {
                      setError(null);
                      try {
                        await client.classes.remove.mutate({ classId: row.id });
                        await reload();
                      } catch (err) {
                        setError(errorMessage(err));
                      }
                    }}
                  >
                    {t("classes.remove")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="row" style={{ marginBottom: 12 }}>
        <label className="field">
          <span>{t("classes.category")}</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {catalog.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("classes.pattern")}</span>
          <select
            value={patternId}
            onChange={(e) => {
              setPatternId(e.target.value);
              setTrotIn(false);
            }}
          >
            {catalog.patterns.map((p) => (
              <option key={p.id} value={p.id}>
                Pattern {p.code} · {p.entryGait.replace("_", "-")} ·{" "}
                {t("classes.maneuvers", { n: p.maneuversCount })}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <label className="field">
          <span>{t("classes.name")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field" style={{ maxWidth: 120 }}>
          <span>{t("classes.entryFee")}</span>
          <input
            className="num"
            type="number"
            min="0"
            value={entryFee}
            onChange={(e) => setEntryFee(e.target.value)}
          />
        </label>
        <label className="field" style={{ maxWidth: 120 }}>
          <span>{t("classes.addedMoney")}</span>
          <input
            className="num"
            type="number"
            min="0"
            value={addedMoney}
            onChange={(e) => setAddedMoney(e.target.value)}
          />
        </label>
        <label className="field" style={{ maxWidth: 120 }}>
          <span>{t("classes.trophyCost")}</span>
          <input
            className="num"
            type="number"
            min="0"
            value={trophyCost}
            onChange={(e) => setTrophyCost(e.target.value)}
          />
        </label>
        <label className="field" style={{ maxWidth: 90 }}>
          <span>{t("classes.judges")}</span>
          <select
            value={judgesCount}
            onChange={(e) => setJudgesCount(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ maxWidth: 140 }}>
          <span>{t("classes.maxEntries")}</span>
          <input
            className="num"
            type="number"
            min="1"
            value={maxEntries}
            onChange={(e) => setMaxEntries(e.target.value)}
          />
        </label>
      </div>
      {pattern?.trotInMandatable && (
        <label className="field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            style={{ width: "auto" }}
            checked={trotIn}
            onChange={(e) => setTrotIn(e.target.checked)}
          />
          <span style={{ margin: 0 }}>{t("classes.trotIn")}</span>
        </label>
      )}
      {error && <div className="error-inline">{error}</div>}
      <button
        className="btn primary"
        disabled={!categoryId || !patternId}
        onClick={async () => {
          setError(null);
          setWarnings([]);
          try {
            const created = await client.classes.create.mutate({
              eventId,
              categoryId,
              patternId,
              ...(name ? { name } : {}),
              entryFee: entryFee || "0",
              addedMoney: addedMoney || "0",
              trophyCost: trophyCost || "0",
              judgesCount,
              trotInImposed: trotIn,
              ...(maxEntries ? { maxEntries: Number(maxEntries) } : {}),
            });
            setName("");
            // ART. 15: avvisi in stile BR-18 — si vede, si decide, mai blocca.
            setWarnings(created.warnings ?? []);
            await reload();
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      >
        {t("classes.add")}
      </button>
      {warnings.length > 0 && (
        <div className="banner warn" style={{ marginTop: 12 }}>
          {warnings.map((w, i) => (
            <div key={i}>
              <strong>{w.code}</strong> — {w.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
