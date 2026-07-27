"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const API =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function fetchQuery<T>(path: string, input: unknown): Promise<T> {
  const url = `${API}/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`;
  const res = await fetch(url, { cache: "no-store" });
  const body = (await res.json()) as { result: { data: T } };
  return body.result.data;
}

/**
 * Aggiornamento live (SSE, tick di invalidazione): al tick si rifà la fetch
 * della vista derivata. EventSource si riconnette da solo; in più un polling
 * di sicurezza a 5s copre proxy che non amano gli stream.
 */
export function useEventLive<T>(eventId: string, queryPath: string, input: unknown) {
  const [data, setData] = useState<T | null>(null);
  const inputRef = useRef(JSON.stringify(input));

  const refetch = useCallback(() => {
    fetchQuery<T>(queryPath, JSON.parse(inputRef.current))
      .then(setData)
      .catch(() => undefined);
  }, [queryPath]);

  useEffect(() => {
    refetch();
    const source = new EventSource(`${API}/live/${eventId}`);
    source.addEventListener("tick", refetch);
    const fallback = setInterval(refetch, 5000);
    return () => {
      source.close();
      clearInterval(fallback);
    };
  }, [eventId, refetch]);

  return data;
}

export function formatEta(
  etaMs: number | null,
  locale: string,
  scheduleLabel: string,
): string {
  if (etaMs === null) return scheduleLabel;
  const minutes = Math.max(1, Math.round(etaMs / 60000));
  // display onesto: sempre "~", mai un orario promesso (BR-54)
  return locale === "it" ? `tra ~${minutes} min` : `in ~${minutes} min`;
}

export function formatScore(total: number | null): string {
  return total === null ? "—" : total.toFixed(1);
}
