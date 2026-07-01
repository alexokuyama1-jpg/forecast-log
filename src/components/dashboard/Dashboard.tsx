import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, setAdminSession } from "@/hooks/use-auth";
import { useForecastData } from "@/hooks/use-forecast-data";
import KpiCard from "./KpiCard";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, DollarSign, Building2, Target, AlertTriangle, Activity, Database, RotateCcw, Save, LogOut, Scale, CalendarRange, FileDown, Upload } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { downloadTemplate, importFromExcel } from "@/lib/excel-io";
import { toast } from "sonner";

type MMap = Record<string, number | null>;
type Field = "real25" | "real26" | "budget26" | "forecast26";

const fmtBRL = (v: number | null | undefined) =>
  v == null || isNaN(v as number) ? "—" :
  Math.abs(v as number) >= 1e6 ? `R$ ${((v as number) / 1e6).toFixed(2)}M` :
  Math.abs(v as number) >= 1e3 ? `R$ ${((v as number) / 1e3).toFixed(0)}k` :
  (v as number).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtNum = (v: number | null | undefined, d = 0) =>
  v == null || isNaN(v as number) ? "—" : (v as number).toLocaleString("pt-BR", { maximumFractionDigits: d });
const fmtPct = (v: number | null | undefined, d = 1) =>
  v == null || isNaN(v as number) ? "—" : `${((v as number) * 100).toFixed(d)}%`;

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];
const MONTH_LABEL: Record<number, string> = {
  1: "Jan", 2: "Fev", 3: "Mar", 4: "Abr", 5: "Mai", 6: "Jun",
  7: "Jul", 8: "Ago", 9: "Set", 10: "Out", 11: "Nov", 12: "Dez",
};

const sumMonths = (m: MMap, months: number[]) =>
  months.reduce((s, x) => s + (m[String(x)] || 0), 0);

export default function Dashboard() {
  const nav = useNavigate();
  const { authed, loading: authLoading, admin } = useAuth();
  useEffect(() => {
    if (!authLoading && !authed) nav({ to: "/login" });
  }, [authLoading, authed, nav]);

  // ============ Editable data, persistido no Supabase ============
  const {
    costRows, setCostRows,
    volRows, setVolRows,
    loading: dataLoading,
    saveStatus,
    resetToServer,
  } = useForecastData();

  const units = useMemo(() => ["all", ...Array.from(new Set(costRows.map((r) => r.unit)))], [costRows]);
  const [unit, setUnit] = useState<string>("all");
  const [period, setPeriod] = useState<string>("ytd");

  const PERIODS: { value: string; label: string; months: number[] }[] = useMemo(() => [
    ...Array.from({ length: 12 }, (_, i) => ({
      value: `m${i + 1}`, label: `${MONTH_LABEL[i + 1]}/26`, months: [i + 1],
    })),
    { value: "b1", label: "Bim. Jan–Fev", months: [1, 2] },
    { value: "b2", label: "Bim. Mar–Abr", months: [3, 4] },
    { value: "b3", label: "Bim. Mai–Jun", months: [5, 6] },
    { value: "b4", label: "Bim. Jul–Ago", months: [7, 8] },
    { value: "b5", label: "Bim. Set–Out", months: [9, 10] },
    { value: "b6", label: "Bim. Nov–Dez", months: [11, 12] },
    { value: "q1", label: "T1 (Jan–Mar)", months: [1, 2, 3] },
    { value: "q2", label: "T2 (Abr–Jun)", months: [4, 5, 6] },
    { value: "q3", label: "T3 (Jul–Set)", months: [7, 8, 9] },
    { value: "q4", label: "T4 (Out–Dez)", months: [10, 11, 12] },
    { value: "h1", label: "1º Semestre", months: [1, 2, 3, 4, 5, 6] },
    { value: "h2", label: "2º Semestre", months: [7, 8, 9, 10, 11, 12] },
    { value: "ytd", label: "YTD (Real)", months: [] },
    { value: "fy", label: "Ano 2026", months: [1,2,3,4,5,6,7,8,9,10,11,12] },
  ], []);

  // YTD = meses com real26 preenchido
  const ytdMonths = useMemo(() => {
    const s = new Set<number>();
    costRows.forEach((r) => { for (let m = 1; m <= 12; m++) if (r.real26[String(m)] != null) s.add(m); });
    return Array.from(s).sort((a, b) => a - b);
  }, [costRows]);
  const periodMonths = useMemo(() => {
    const p = PERIODS.find((x) => x.value === period)!;
    return p.value === "ytd" ? ytdMonths : p.months;
  }, [period, PERIODS, ytdMonths]);
  const periodLabel = useMemo(() => PERIODS.find((p) => p.value === period)?.label ?? "", [period, PERIODS]);

  const rowsFiltered = useMemo(
    () => costRows.filter((r) => unit === "all" || r.unit === unit),
    [unit, costRows],
  );
  const volFiltered = useMemo(
    () => volRows.filter((v) => unit === "all" || v.unit === unit),
    [unit, volRows],
  );

  // ============ Editing ============
  const updateCost = (idx: number, field: Field, m: number, val: string) => {
    setCostRows((prev) => {
      const next = prev.slice();
      const row = { ...next[idx], [field]: { ...next[idx][field] } };
      const num = val === "" ? null : Number(val.replace(",", "."));
      row[field][String(m)] = Number.isFinite(num as number) ? (num as number) : null;
      next[idx] = row;
      return next;
    });
  };
  const updateVol = (idx: number, field: Field, m: number, val: string) => {
    setVolRows((prev) => {
      const next = prev.slice();
      const row = { ...next[idx], [field]: { ...next[idx][field] } };
      const num = val === "" ? null : Number(val.replace(",", "."));
      row[field][String(m)] = Number.isFinite(num as number) ? (num as number) : null;
      next[idx] = row;
      return next;
    });
  };
  const resetAll = () => {
    resetToServer();
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const handleDownloadTemplate = () => {
    try {
      downloadTemplate(costRows, volRows);
      toast.success("Modelo Excel baixado", { description: "Preencha e reimporte pelo botão 'Importar Excel'." });
    } catch (e) {
      toast.error("Falha ao gerar modelo", { description: String((e as Error).message) });
    }
  };
  const handleImportClick = () => fileInputRef.current?.click();
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { costRows: c, volRows: v, stats } = await importFromExcel(file, costRows, volRows);
      setCostRows(c);
      setVolRows(v);
      toast.success("Base atualizada via Excel", {
        description: `Custos: ${stats.costsUpdated} atualizados, ${stats.costsAdded} novos · Volume: ${stats.volsUpdated} atualizados, ${stats.volsAdded} novos${stats.skipped ? ` · ${stats.skipped} linhas ignoradas` : ""}`,
      });
    } catch (err) {
      toast.error("Falha ao importar Excel", { description: String((err as Error).message) });
    }
  };

  // ============ KPIs (todos respeitam filtro unidade + período) ============
  const months = periodMonths;
  const sumReal26  = rowsFiltered.reduce((a, r) => a + sumMonths(r.real26, months), 0);
  const sumReal25  = rowsFiltered.reduce((a, r) => a + sumMonths(r.real25, months), 0);
  const sumFC      = rowsFiltered.reduce((a, r) => a + sumMonths(r.forecast26, months), 0);
  const sumBud     = rowsFiltered.reduce((a, r) => a + sumMonths(r.budget26, months), 0);
  const variance   = sumFC - sumBud;
  const variancePct = sumBud ? variance / sumBud : 0;
  const atualVsBud = sumReal26 - sumBud;
  const atualVsBudPct = sumBud ? atualVsBud / sumBud : 0;
  const yoy = sumReal26 - sumReal25;
  const yoyPct = sumReal25 ? yoy / sumReal25 : 0;

  // ============ Evolução mensal ============
  const monthly = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1, k = String(m);
      let r26 = 0, r25 = 0, fc = 0, bud = 0, h26 = false, h25 = false, hfc = false, hbud = false;
      rowsFiltered.forEach((r) => {
        if (r.real26[k] != null) { r26 += r.real26[k]!; h26 = true; }
        if (r.real25[k] != null) { r25 += r.real25[k]!; h25 = true; }
        if (r.forecast26[k] != null) { fc += r.forecast26[k]!; hfc = true; }
        if (r.budget26[k] != null) { bud += r.budget26[k]!; hbud = true; }
      });
      return {
        name: `${MONTH_LABEL[m]}`,
        "Real 2026": h26 ? Math.round(r26) : null,
        "Real 2025": h25 ? Math.round(r25) : null,
        Forecast: hfc ? Math.round(fc) : null,
        Budget: hbud ? Math.round(bud) : null,
      };
    });
  }, [rowsFiltered]);

  // ============ Por pacote ============
  const byPacote = useMemo(() => {
    const m = new Map<string, { name: string; Realizado: number; Forecast: number; Budget: number }>();
    rowsFiltered.forEach((r) => {
      const e = m.get(r.pacote) || { name: r.pacote, Realizado: 0, Forecast: 0, Budget: 0 };
      e.Realizado += sumMonths(r.real26, months);
      e.Forecast  += sumMonths(r.forecast26, months);
      e.Budget    += sumMonths(r.budget26, months);
      m.set(r.pacote, e);
    });
    return Array.from(m.values()).sort((a, b) => (b.Realizado + b.Forecast) - (a.Realizado + a.Forecast));
  }, [rowsFiltered, months]);

  // ============ Desvios ============
  const desvios = useMemo(() => rowsFiltered
    .map((r) => {
      const fc = sumMonths(r.forecast26, months);
      const bud = sumMonths(r.budget26, months);
      return { unit: r.unit, pacote: r.pacote, subpacote: r.subpacote || "—", forecast: fc, budget: bud, delta: fc - bud };
    })
    .filter((r) => Math.abs(r.delta) > 1000)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 15), [rowsFiltered, months]);

  // ============ Por unidade ============
  const unitTable = useMemo(() => {
    const us = Array.from(new Set(costRows.map((r) => r.unit)));
    return us.map((u) => {
      const rs = costRows.filter((r) => r.unit === u);
      const fc  = rs.reduce((a, r) => a + sumMonths(r.forecast26, months), 0);
      const bud = rs.reduce((a, r) => a + sumMonths(r.budget26, months), 0);
      const r26 = rs.reduce((a, r) => a + sumMonths(r.real26, months), 0);
      return { unit: u, forecast: fc, budget: bud, real: r26, delta: fc - bud, deltaPct: bud ? (fc - bud) / bud : 0 };
    });
  }, [costRows, months]);

  const pieByUnit = useMemo(() => unitTable.map((u) => ({ name: u.unit, value: Math.round(u.forecast) })), [unitTable]);

  // ============ Volume & R$/TON ============
  // Para cada unidade filtrada, soma custos (real onde houver, fc onde não) e volume idem
  const rtonRows = useMemo(() => {
    return volFiltered.map((v) => {
      const cs = costRows.filter((r) => r.unit === v.unit);
      const volReal = sumMonths(v.real26, months);
      const volFc   = sumMonths(v.forecast26, months);
      const volBud  = sumMonths(v.budget26, months);
      const volReal25 = sumMonths(v.real25, months);
      const cReal = cs.reduce((a, r) => a + sumMonths(r.real26, months), 0);
      const cFc   = cs.reduce((a, r) => a + sumMonths(r.forecast26, months), 0);
      const cBud  = cs.reduce((a, r) => a + sumMonths(r.budget26, months), 0);
      const cReal25 = cs.reduce((a, r) => a + sumMonths(r.real25, months), 0);
      return {
        name: v.unit.replace("CD ", "").replace("TSP ", ""),
        unit: v.unit,
        volReal, volFc, volBud, volReal25,
        cReal, cFc, cBud, cReal25,
        rtonReal:   volReal   ? (cReal   / volReal)   * 1000 : 0,
        rtonFc:     volFc     ? (cFc     / volFc)     * 1000 : 0,
        rtonBud:    volBud    ? (cBud    / volBud)    * 1000 : 0,
        rtonReal25: volReal25 ? (cReal25 / volReal25) * 1000 : 0,
      };
    });
  }, [volFiltered, costRows, months]);
  const rtonChart = useMemo(() => rtonRows.map((r) => ({
    name: r.name,
    "R$/TON Real 26": Math.round(r.rtonReal * 100) / 100,
    "R$/TON Forecast": Math.round(r.rtonFc * 100) / 100,
    "R$/TON Budget": Math.round(r.rtonBud * 100) / 100,
    "R$/TON Real 25": Math.round(r.rtonReal25 * 100) / 100,
  })), [rtonRows]);
  const volumeChart = useMemo(() => rtonRows.map((r) => ({
    name: r.name,
    "Volume Real": Math.round(r.volReal),
    "Volume Forecast": Math.round(r.volFc),
    "Volume Budget": Math.round(r.volBud),
  })), [rtonRows]);

  const logout = async () => {
    if (admin) setAdminSession(null);
    else await supabase.auth.signOut();
    nav({ to: "/login" });
  };

  const isMobile = useIsMobile();
  const chartH = isMobile ? 260 : 320;
  const chartHMain = isMobile ? 300 : 380;

  if (authLoading || (authed && dataLoading)) return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando…</div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-[1600px] px-3 sm:px-6 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
             Lactalis Brasil — PR · Forecast 2026 {admin && <Badge variant="secondary" className="ml-1">admin</Badge>}
            </div>
            <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Painel de Forecast — Custos & Volume</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Análise multi-CD: realizado 25/26, forecast, budget, desvios e R$/TON</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Unidade" /></SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u} value={u}>{u === "all" ? "Todas as unidades" : u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-full sm:w-[220px]"><CalendarRange className="h-3.5 w-3.5 mr-1" /><SelectValue placeholder="Período" /></SelectTrigger>
              <SelectContent className="max-h-[440px]">
                <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground">Mês</div>
                {PERIODS.filter((p) => p.value.startsWith("m")).map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground">Bimestre</div>
                {PERIODS.filter((p) => p.value.startsWith("b")).map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground">Trimestre</div>
                {PERIODS.filter((p) => p.value.startsWith("q")).map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground">Outros</div>
                {PERIODS.filter((p) => ["h1", "h2", "ytd", "fy"].includes(p.value)).map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={logout}><LogOut className="h-3.5 w-3.5 mr-1" /> Sair</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          <KpiCard icon={DollarSign} label={`Realizado 26 — ${periodLabel}`} value={fmtBRL(sumReal26)} hint={months.length ? `${months.length} mês(es)` : "sem real no período"} />
          <KpiCard icon={Target}     label={`Forecast — ${periodLabel}`}      value={fmtBRL(sumFC)} />
          <KpiCard icon={Activity}   label={`Budget — ${periodLabel}`}        value={fmtBRL(sumBud)} />
          <KpiCard icon={variance > 0 ? TrendingUp : TrendingDown}
            label="Desvio FC vs Bud" value={fmtBRL(variance)}
            tone={variance > 0 ? "bad" : "good"}
            hint={`${variancePct >= 0 ? "+" : ""}${fmtPct(variancePct)}`} />
          <KpiCard icon={Scale} label="Atual vs Bud" value={fmtBRL(atualVsBud)}
            tone={atualVsBud > 0 ? "bad" : "good"}
            hint={`${atualVsBudPct >= 0 ? "+" : ""}${fmtPct(atualVsBudPct)}`} />
          <KpiCard icon={yoy > 0 ? TrendingUp : TrendingDown}
            label="Ano vs Ano (26 vs 25)" value={fmtBRL(yoy)}
            tone={yoy > 0 ? "bad" : "good"}
            hint={`${yoyPct >= 0 ? "+" : ""}${fmtPct(yoyPct)} · 25: ${fmtBRL(sumReal25)}`} />
        </section>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full md:w-auto h-auto gap-1">
            <TabsTrigger value="overview" className="text-[11px] sm:text-sm whitespace-normal h-auto py-1.5 leading-tight">Visão Geral</TabsTrigger>
            <TabsTrigger value="pacotes" className="text-[11px] sm:text-sm whitespace-normal h-auto py-1.5 leading-tight">Pacotes</TabsTrigger>
            <TabsTrigger value="desvios" className="text-[11px] sm:text-sm whitespace-normal h-auto py-1.5 leading-tight">Desvios</TabsTrigger>
            <TabsTrigger value="unidades" className="text-[11px] sm:text-sm whitespace-normal h-auto py-1.5 leading-tight">Unidades</TabsTrigger>
            <TabsTrigger value="rston" className="text-[11px] sm:text-sm whitespace-normal h-auto py-1.5 leading-tight">Volume & R$/TON</TabsTrigger>
            <TabsTrigger value="base" className="text-[11px] sm:text-sm whitespace-normal h-auto py-1.5 leading-tight">Base de Dados</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Evolução mensal — 2025 vs 2026</CardTitle>
                <CardDescription>Custos agregados em R$ (filtro por unidade)</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={chartHMain}>
                  <ComposedChart data={monthly}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} />
                    <Tooltip formatter={(v: number) => fmtBRL(v)} />
                    <Legend />
                    <Bar dataKey="Real 2026" fill="#2563eb" />
                    <Line type="monotone" dataKey="Real 2025" stroke="#0891b2" strokeWidth={2} dot />
                    <Line type="monotone" dataKey="Forecast" stroke="#16a34a" strokeWidth={2} dot />
                    <Line type="monotone" dataKey="Budget" stroke="#dc2626" strokeWidth={2} strokeDasharray="5 5" dot />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Forecast por unidade</CardTitle>
                  <CardDescription>{periodLabel} — FC vs Budget vs Real 26</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={chartH}>
                    <BarChart data={unitTable}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="unit" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} />
                      <Tooltip formatter={(v: number) => fmtBRL(v)} />
                      <Legend />
                      <Bar dataKey="real" name="Real 26" fill="#2563eb" />
                      <Bar dataKey="forecast" name="Forecast" fill="#16a34a" />
                      <Bar dataKey="budget" name="Budget" fill="#94a3b8" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Mix por unidade</CardTitle>
                  <CardDescription>Participação no forecast</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={chartH}>
                    <PieChart>
                      <Pie data={pieByUnit} dataKey="value" nameKey="name" innerRadius={isMobile ? 40 : 60} outerRadius={isMobile ? 80 : 110} paddingAngle={2}>
                        {pieByUnit.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmtBRL(v)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="pacotes" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Custos por pacote — {periodLabel}</CardTitle>
                <CardDescription>Real 26, Forecast e Budget consolidados</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(isMobile ? 320 : 360, byPacote.length * (isMobile ? 22 : 26))}>
                  <BarChart data={byPacote.slice(0, 15)} layout="vertical" margin={{ left: isMobile ? 0 : 30 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis dataKey="name" type="category" width={isMobile ? 110 : 210} tick={{ fontSize: isMobile ? 9 : 11 }} />
                    <Tooltip formatter={(v: number) => fmtBRL(v)} />
                    <Legend />
                    <Bar dataKey="Realizado" fill="#2563eb" />
                    <Bar dataKey="Forecast" fill="#16a34a" />
                    <Bar dataKey="Budget" fill="#94a3b8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="desvios" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Top desvios — FC vs Bud ({periodLabel})
                </CardTitle>
                <CardDescription>Subpacotes que mais distorcem o orçamento</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2 px-2">Unidade</th>
                      <th className="text-left py-2 px-2">Pacote</th>
                      <th className="text-left py-2 px-2">Subpacote</th>
                      <th className="text-right py-2 px-2">Budget</th>
                      <th className="text-right py-2 px-2">Forecast</th>
                      <th className="text-right py-2 px-2">Desvio</th>
                      <th className="text-right py-2 px-2">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {desvios.map((d, i) => {
                      const pct = d.budget ? (d.delta / d.budget) * 100 : 0;
                      return (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 px-2 font-medium">{d.unit.replace("CD ", "")}</td>
                          <td className="py-2 px-2 text-muted-foreground">{d.pacote}</td>
                          <td className="py-2 px-2">{d.subpacote}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{fmtBRL(d.budget)}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{fmtBRL(d.forecast)}</td>
                          <td className={`py-2 px-2 text-right tabular-nums font-semibold ${d.delta > 0 ? "text-red-600" : "text-green-600"}`}>
                            {d.delta > 0 ? "+" : ""}{fmtBRL(d.delta)}
                          </td>
                          <td className="py-2 px-2 text-right">
                            <Badge variant={Math.abs(pct) > 50 ? "destructive" : "secondary"}>
                              {pct > 0 ? "+" : ""}{pct.toFixed(0)}%
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="unidades" className="space-y-4">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
              {unitTable.map((u) => (
                <Card key={u.unit}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />{u.unit}
                    </CardTitle>
                    <CardDescription>{periodLabel}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Real 26</span><span className="font-semibold tabular-nums">{fmtBRL(u.real)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Forecast</span><span className="tabular-nums">{fmtBRL(u.forecast)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Budget</span><span className="tabular-nums">{fmtBRL(u.budget)}</span></div>
                    <div className="flex justify-between text-sm pt-2 border-t">
                      <span className="text-muted-foreground">Desvio FC vs Bud</span>
                      <Badge variant={u.delta > 0 ? "destructive" : "secondary"}>
                        {u.delta > 0 ? "+" : ""}{fmtBRL(u.delta)} ({fmtPct(u.deltaPct)})
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="rston" className="space-y-4">
            <div className="grid lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Volume — {periodLabel}</CardTitle>
                  <CardDescription>Por unidade (filtros aplicados)</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={isMobile ? 240 : 300}>
                    <BarChart data={volumeChart}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} />
                      <Tooltip formatter={(v: number) => fmtNum(v)} />
                      <Legend />
                      <Bar dataKey="Volume Real" fill="#2563eb" />
                      <Bar dataKey="Volume Forecast" fill="#16a34a" />
                      <Bar dataKey="Volume Budget" fill="#94a3b8" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>R$/TON — {periodLabel}</CardTitle>
                  <CardDescription>Custo unitário = (Custo ÷ Volume) × 1000</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={isMobile ? 240 : 300}>
                    <BarChart data={rtonChart}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => `R$ ${fmtNum(v, 2)}`} />
                      <Legend />
                      <Bar dataKey="R$/TON Real 26" fill="#2563eb" />
                      <Bar dataKey="R$/TON Forecast" fill="#16a34a" />
                      <Bar dataKey="R$/TON Budget" fill="#f59e0b" />
                      <Bar dataKey="R$/TON Real 25" fill="#0891b2" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Detalhado — Volume, Custos e R$/TON ({periodLabel})</CardTitle>
                <CardDescription>Filtrado pela unidade e período</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2 px-2">Unidade</th>
                      <th className="text-right py-2 px-2">Vol Real 26</th>
                      <th className="text-right py-2 px-2">Vol FC</th>
                      <th className="text-right py-2 px-2">Vol Bud</th>
                      <th className="text-right py-2 px-2">Custo Real 26</th>
                      <th className="text-right py-2 px-2">Custo FC</th>
                      <th className="text-right py-2 px-2">Custo Bud</th>
                      <th className="text-right py-2 px-2">R$/TON Real</th>
                      <th className="text-right py-2 px-2">R$/TON FC</th>
                      <th className="text-right py-2 px-2">R$/TON Bud</th>
                      <th className="text-right py-2 px-2 text-cyan-600">R$/TON 25</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rtonRows.map((r, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 px-2 font-medium">{r.unit}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtNum(r.volReal)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtNum(r.volFc)}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{fmtNum(r.volBud)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtBRL(r.cReal)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtBRL(r.cFc)}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{fmtBRL(r.cBud)}</td>
                        <td className="py-2 px-2 text-right tabular-nums font-semibold">R$ {fmtNum(r.rtonReal, 2)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">R$ {fmtNum(r.rtonFc, 2)}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">R$ {fmtNum(r.rtonBud, 2)}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-cyan-700">R$ {fmtNum(r.rtonReal25, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="base" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2"><Database className="h-4 w-4 text-primary" /> Base de dados</CardTitle>
                  <CardDescription>
                    Edite Custos e Volumes (Jan–Dez/26) e visualize Real 2025 (somente leitura). Tudo reflete em tempo real nos KPIs, gráficos e R$/TON. Use o filtro <strong>Unidade</strong> no topo para focar em uma CD.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Badge variant={saveStatus === "error" ? "destructive" : "secondary"} className="gap-1">
                    <Save className="h-3 w-3" />
                    {saveStatus === "saving" ? "Salvando…" : saveStatus === "error" ? "Erro ao salvar" : "Auto-salvo"}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={resetAll}><RotateCcw className="h-3.5 w-3.5 mr-1" /> Recarregar do servidor</Button>
                  <Button variant="default" size="sm" onClick={handleImportClick}><Upload className="h-3.5 w-3.5 mr-1" /> Importar Excel</Button>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportFile} />
                  <Button variant="outline" size="sm" onClick={resetAll}><RotateCcw className="h-3.5 w-3.5 mr-1" /> Restaurar original</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* CUSTOS */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">Custos</h3>
                  <Tabs defaultValue="real26" className="space-y-3">
                    <TabsList>
                      <TabsTrigger value="real26">Real do mês 2026</TabsTrigger>
                      <TabsTrigger value="forecast26">Forecast 2026</TabsTrigger>
                      <TabsTrigger value="budget26">Budget 2026</TabsTrigger>
                      <TabsTrigger value="real25">Real 2025</TabsTrigger>
                    </TabsList>
                    {(["real26", "forecast26", "budget26", "real25"] as Field[]).map((field) => {
                      const readonly = field === "real25";
                      return (
                        <TabsContent key={field} value={field} className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead className="text-[10px] uppercase text-muted-foreground border-b sticky top-0 bg-card z-10">
                              <tr>
                                <th className="text-left py-2 px-2 sticky left-0 bg-card">Unidade</th>
                                <th className="text-left py-2 px-2 sticky left-[110px] bg-card">Pacote</th>
                                <th className="text-left py-2 px-2 sticky left-[230px] bg-card">Subpacote</th>
                                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                  <th key={m} className={`text-right py-2 px-2 ${field === "real26" ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}>{MONTH_LABEL[m]}</th>
                                ))}
                                <th className="text-right py-2 px-2 border-l">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {costRows.map((r, idx) => ({ r, idx }))
                                .filter(({ r }) => unit === "all" || r.unit === unit)
                                .map(({ r, idx }) => {
                                  const total = Array.from({ length: 12 }, (_, i) => i + 1).reduce((s, m) => s + (r[field][String(m)] || 0), 0);
                                  return (
                                    <tr key={idx} className="border-b last:border-0 hover:bg-muted/30">
                                      <td className="py-1 px-2 font-medium whitespace-nowrap sticky left-0 bg-card">{r.unit.replace("CD ", "")}</td>
                                      <td className="py-1 px-2 text-muted-foreground whitespace-nowrap sticky left-[110px] bg-card">{r.pacote}</td>
                                      <td className="py-1 px-2 whitespace-nowrap sticky left-[230px] bg-card">{r.subpacote || "—"}</td>
                                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                        <td key={m} className="py-1 px-1">
                                          {readonly ? (
                                            <div className="h-7 px-2 text-right tabular-nums text-xs w-24 ml-auto leading-7 text-muted-foreground">
                                              {r[field][String(m)] != null ? fmtNum(r[field][String(m)], 0) : "—"}
                                            </div>
                                          ) : (
                                            <Input
                                              type="number"
                                              value={r[field][String(m)] ?? ""}
                                              placeholder="—"
                                              onChange={(e) => updateCost(idx, field, m, e.target.value)}
                                              className={`h-7 text-right tabular-nums text-xs w-24 ml-auto ${field === "real26" ? "border-blue-200 focus-visible:ring-blue-500" : ""}`}
                                            />
                                          )}
                                        </td>
                                      ))}
                                      <td className="py-1 px-2 text-right tabular-nums font-semibold border-l">{fmtBRL(total)}</td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </TabsContent>
                      );
                    })}
                  </Tabs>
                </div>

                {/* VOLUMES */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">Volume (kg) — usado no cálculo de R$/TON</h3>
                  <Tabs defaultValue="real26" className="space-y-3">
                    <TabsList>
                      <TabsTrigger value="real26">Volume Real 2026</TabsTrigger>
                      <TabsTrigger value="forecast26">Volume Forecast 2026</TabsTrigger>
                      <TabsTrigger value="budget26">Volume Budget 2026</TabsTrigger>
                      <TabsTrigger value="real25">Volume Real 2025</TabsTrigger>
                    </TabsList>
                    {(["real26", "forecast26", "budget26", "real25"] as Field[]).map((field) => {
                      const readonly = field === "real25";
                      return (
                        <TabsContent key={field} value={field} className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead className="text-[10px] uppercase text-muted-foreground border-b">
                              <tr>
                                <th className="text-left py-2 px-2">Unidade</th>
                                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                  <th key={m} className={`text-right py-2 px-2 ${field === "real26" ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}>{MONTH_LABEL[m]}</th>
                                ))}
                                <th className="text-right py-2 px-2 border-l">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {volRows.map((v, idx) => ({ v, idx }))
                                .filter(({ v }) => unit === "all" || v.unit === unit)
                                .map(({ v, idx }) => {
                                  const total = Array.from({ length: 12 }, (_, i) => i + 1).reduce((s, m) => s + (v[field][String(m)] || 0), 0);
                                  return (
                                    <tr key={idx} className="border-b last:border-0 hover:bg-muted/30">
                                      <td className="py-1 px-2 font-medium whitespace-nowrap">{v.unit}</td>
                                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                        <td key={m} className="py-1 px-1">
                                          {readonly ? (
                                            <div className="h-7 px-2 text-right tabular-nums text-xs w-28 ml-auto leading-7 text-muted-foreground">
                                              {v[field][String(m)] != null ? fmtNum(v[field][String(m)], 0) : "—"}
                                            </div>
                                          ) : (
                                            <Input
                                              type="number"
                                              value={v[field][String(m)] ?? ""}
                                              placeholder="—"
                                              onChange={(e) => updateVol(idx, field, m, e.target.value)}
                                              className={`h-7 text-right tabular-nums text-xs w-28 ml-auto ${field === "real26" ? "border-blue-200 focus-visible:ring-blue-500" : ""}`}
                                            />
                                          )}
                                        </td>
                                      ))}
                                      <td className="py-1 px-2 text-right tabular-nums font-semibold border-l">{fmtNum(total)}</td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </TabsContent>
                      );
                    })}
                  </Tabs>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <footer className="text-xs text-muted-foreground text-center pt-6">
          Fonte: BASE_CUSTO_VOLUME.xlsx · {costRows.length} linhas de custos · {volRows.length} unidades de volume
        </footer>
      </main>
    </div>
  );
}
