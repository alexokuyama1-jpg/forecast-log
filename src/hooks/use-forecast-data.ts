import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type MMap = Record<string, number | null>;
export type CostRow = {
  id?: string;
  unit: string;
  pacote: string;
  subpacote: string | null;
  real25: MMap;
  real26: MMap;
  budget26: MMap;
  forecast26: MMap;
};
export type VolRow = {
  id?: string;
  unit: string;
  real25: MMap;
  real26: MMap;
  budget26: MMap;
  forecast26: MMap;
};

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export function useForecastData() {
  const [costRows, setCostRows] = useState<CostRow[]>([]);
  const [volRows, setVolRows] = useState<VolRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSave = useRef(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [costRes, volRes] = await Promise.all([
      supabase.from("cost_rows").select("*").order("unit").order("pacote"),
      supabase.from("volume_rows").select("*").order("unit"),
    ]);
    if (costRes.error) console.error("[forecast] erro ao carregar cost_rows:", costRes.error);
    if (volRes.error) console.error("[forecast] erro ao carregar volume_rows:", volRes.error);
    skipNextSave.current = true;
    setCostRows((costRes.data as unknown as CostRow[]) ?? []);
    setVolRows((volRes.data as unknown as VolRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const scheduleSave = useCallback((nextCost: CostRow[], nextVol: VolRow[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    saveTimer.current = setTimeout(async () => {
      try {
        const costPayload = nextCost.map((r) => ({
          ...(r.id ? { id: r.id } : {}),
          unit: r.unit,
          pacote: r.pacote,
          subpacote: r.subpacote,
          real25: r.real25,
          real26: r.real26,
          budget26: r.budget26,
          forecast26: r.forecast26,
          updated_at: new Date().toISOString(),
        }));
        const volPayload = nextVol.map((r) => ({
          ...(r.id ? { id: r.id } : {}),
          unit: r.unit,
          real25: r.real25,
          real26: r.real26,
          budget26: r.budget26,
          forecast26: r.forecast26,
          updated_at: new Date().toISOString(),
        }));
        const [costRes, volRes] = await Promise.all([
          costPayload.length
            ? supabase.from("cost_rows").upsert(costPayload, { onConflict: "id" }).select("id")
            : Promise.resolve({ data: [], error: null }),
          volPayload.length
            ? supabase.from("volume_rows").upsert(volPayload, { onConflict: "id" }).select("id")
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (costRes.error || volRes.error) {
          console.error("[forecast] erro ao salvar:", costRes.error || volRes.error);
          setSaveStatus("error");
          return;
        }
        const costIds = costRes.data as { id: string }[] | null;
        const volIds = volRes.data as { id: string }[] | null;
        skipNextSave.current = true;
        if (costIds && costIds.length === nextCost.length) {
          setCostRows((prev) => prev.map((r, i) => (r.id ? r : { ...r, id: costIds[i]?.id })));
        }
        if (volIds && volIds.length === nextVol.length) {
          setVolRows((prev) => prev.map((r, i) => (r.id ? r : { ...r, id: volIds[i]?.id })));
        }
        setSaveStatus("saved");
      } catch (e) {
        console.error("[forecast] erro ao salvar:", e);
        setSaveStatus("error");
      }
    }, 800);
  }, []);

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    scheduleSave(costRows, volRows);
  }, [costRows, volRows, scheduleSave]);

  const resetToServer = useCallback(() => {
    loadAll();
  }, [loadAll]);

  return {
    costRows,
    setCostRows,
    volRows,
    setVolRows,
    loading,
    saveStatus,
    resetToServer,
    reload: loadAll,
  };
}