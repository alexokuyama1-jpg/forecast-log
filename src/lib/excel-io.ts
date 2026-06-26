import * as XLSX from "xlsx";

type MMap = Record<string, number | null>;
export type CostRow = {
  unit: string; pacote: string; subpacote: string | null;
  real25: MMap; real26: MMap; budget26: MMap; forecast26: MMap;
};
export type VolRow = { unit: string; real25: MMap; real26: MMap; budget26: MMap; forecast26: MMap };
export type Field = "real25" | "real26" | "budget26" | "forecast26";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const FIELDS: Field[] = ["real25", "real26", "budget26", "forecast26"];
const FIELD_LABEL: Record<Field, string> = {
  real25: "Real 2025",
  real26: "Real 2026",
  budget26: "Budget 2026",
  forecast26: "Forecast 2026",
};
const LABEL_TO_FIELD: Record<string, Field> = Object.fromEntries(
  Object.entries(FIELD_LABEL).map(([k, v]) => [v.toLowerCase(), k as Field]),
) as Record<string, Field>;

const emptyMonths = (): MMap => Object.fromEntries(MONTHS.map((_, i) => [String(i + 1), null]));

function rowToMonthsArray(m: MMap): (number | null)[] {
  return MONTHS.map((_, i) => {
    const v = m[String(i + 1)];
    return v == null ? null : v;
  });
}

export function downloadTemplate(costRows: CostRow[], volRows: VolRow[]) {
  const wb = XLSX.utils.book_new();

  // Custos sheet
  const costHeader = ["Unidade", "Pacote", "Subpacote", "Tipo", ...MONTHS];
  const costData: (string | number | null)[][] = [costHeader];
  costRows.forEach((r) => {
    FIELDS.forEach((f) => {
      costData.push([r.unit, r.pacote, r.subpacote ?? "", FIELD_LABEL[f], ...rowToMonthsArray(r[f])]);
    });
  });
  const wsCost = XLSX.utils.aoa_to_sheet(costData);
  wsCost["!cols"] = [{ wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 14 }, ...MONTHS.map(() => ({ wch: 10 }))];
  XLSX.utils.book_append_sheet(wb, wsCost, "Custos");

  // Volume sheet
  const volHeader = ["Unidade", "Tipo", ...MONTHS];
  const volData: (string | number | null)[][] = [volHeader];
  volRows.forEach((v) => {
    FIELDS.forEach((f) => {
      volData.push([v.unit, FIELD_LABEL[f], ...rowToMonthsArray(v[f])]);
    });
  });
  const wsVol = XLSX.utils.aoa_to_sheet(volData);
  wsVol["!cols"] = [{ wch: 18 }, { wch: 14 }, ...MONTHS.map(() => ({ wch: 10 }))];
  XLSX.utils.book_append_sheet(wb, wsVol, "Volume");

  // Instruções
  const instr = [
    ["Modelo de importação — Painel de Forecast"],
    [],
    ["Aba 'Custos':"],
    ["Colunas: Unidade | Pacote | Subpacote | Tipo | Jan..Dez"],
    ["Tipo aceito: Real 2025, Real 2026, Budget 2026, Forecast 2026"],
    ["Valores em R$. Deixe a célula vazia para 'sem dado'."],
    [],
    ["Aba 'Volume':"],
    ["Colunas: Unidade | Tipo | Jan..Dez"],
    ["Tipo aceito igual à aba Custos. Valores em TON."],
    [],
    ["Importação:"],
    ["• Linhas existentes (mesma Unidade+Pacote+Subpacote) são atualizadas."],
    ["• Novas combinações são adicionadas."],
    ["• Use 'Restaurar original' para voltar ao baseline."],
  ];
  const wsI = XLSX.utils.aoa_to_sheet(instr);
  wsI["!cols"] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsI, "Instruções");

  XLSX.writeFile(wb, "modelo-base-forecast.xlsx");
}

function parseNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeField(v: unknown): Field | null {
  if (v == null) return null;
  const key = String(v).trim().toLowerCase();
  if (LABEL_TO_FIELD[key]) return LABEL_TO_FIELD[key];
  // accept raw keys
  if ((FIELDS as string[]).includes(key)) return key as Field;
  return null;
}

export type ImportResult = {
  costRows: CostRow[];
  volRows: VolRow[];
  stats: { costsUpdated: number; costsAdded: number; volsUpdated: number; volsAdded: number; skipped: number };
};

export async function importFromExcel(
  file: File,
  currentCosts: CostRow[],
  currentVols: VolRow[],
): Promise<ImportResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const stats = { costsUpdated: 0, costsAdded: 0, volsUpdated: 0, volsAdded: 0, skipped: 0 };

  const costs: CostRow[] = currentCosts.map((r) => ({
    ...r,
    real25: { ...r.real25 }, real26: { ...r.real26 },
    budget26: { ...r.budget26 }, forecast26: { ...r.forecast26 },
  }));
  const vols: VolRow[] = currentVols.map((v) => ({
    ...v,
    real25: { ...v.real25 }, real26: { ...v.real26 },
    budget26: { ...v.budget26 }, forecast26: { ...v.forecast26 },
  }));

  const costSheet = wb.Sheets["Custos"] || wb.Sheets[wb.SheetNames.find((n) => n.toLowerCase() === "custos") || ""];
  if (costSheet) {
    const rows = XLSX.utils.sheet_to_json<any>(costSheet, { defval: null });
    rows.forEach((row) => {
      const unit = row["Unidade"] ?? row["unit"];
      const pacote = row["Pacote"] ?? row["pacote"];
      const subpacoteRaw = row["Subpacote"] ?? row["subpacote"];
      const field = normalizeField(row["Tipo"] ?? row["tipo"]);
      if (!unit || !pacote || !field) { stats.skipped++; return; }
      const subpacote = subpacoteRaw == null || subpacoteRaw === "" ? null : String(subpacoteRaw);
      let target = costs.find((r) =>
        r.unit === unit && r.pacote === pacote &&
        (r.subpacote ?? "") === (subpacote ?? ""),
      );
      if (!target) {
        target = {
          unit: String(unit), pacote: String(pacote), subpacote,
          real25: emptyMonths(), real26: emptyMonths(),
          budget26: emptyMonths(), forecast26: emptyMonths(),
        };
        costs.push(target);
        stats.costsAdded++;
      } else {
        stats.costsUpdated++;
      }
      MONTHS.forEach((label, i) => {
        if (label in row) target![field][String(i + 1)] = parseNum(row[label]);
      });
    });
  }

  const volSheet = wb.Sheets["Volume"] || wb.Sheets[wb.SheetNames.find((n) => n.toLowerCase() === "volume") || ""];
  if (volSheet) {
    const rows = XLSX.utils.sheet_to_json<any>(volSheet, { defval: null });
    rows.forEach((row) => {
      const unit = row["Unidade"] ?? row["unit"];
      const field = normalizeField(row["Tipo"] ?? row["tipo"]);
      if (!unit || !field) { stats.skipped++; return; }
      let target = vols.find((v) => v.unit === unit);
      if (!target) {
        target = {
          unit: String(unit),
          real25: emptyMonths(), real26: emptyMonths(),
          budget26: emptyMonths(), forecast26: emptyMonths(),
        };
        vols.push(target);
        stats.volsAdded++;
      } else {
        stats.volsUpdated++;
      }
      MONTHS.forEach((label, i) => {
        if (label in row) target![field][String(i + 1)] = parseNum(row[label]);
      });
    });
  }

  return { costRows: costs, volRows: vols, stats };
}