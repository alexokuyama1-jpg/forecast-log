import { useEffect, useMemo, useState } from "react";
import data from "@/data/forecast.json";
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
import { TrendingUp, TrendingDown, DollarSign, Building2, Target, AlertTriangle, Activity, Database, RotateCcw, Save } from "lucide-react";

type ForecastRow = {
  unit: string; pacote: string; subpacote: string | null;
  real: Record<string, number | null>;
  budget: Record<string, number | null>;
  forecast: Record<string, number | null>;
  m1: number | null;
};
type DinTT = {
  unit: string;
  real: Record<string, number | null>;
  forecast: Record<string, number | null>;
  budget: Record<string, number | null>;
  m1: number | null; mBudget: number | null;
};
type RtonBlock = { unit: string; real: Record<string, number | null>;
  budget05: number | null; forecast05: number | null;
  budget06: number | null; budget07: number | null;
  forecast06: number | null; forecast07: number | null;
};
type Pc = {
  unit: string; pacote: string; subpacote: string | null;
  real: Record<string, number | null>;
  forecast05: number | null; budget05: number | null;
  m1: number | null; mBudget: number | null;
  forecast06: number | null; forecast07: number | null;
};

const D = data as unknown as {
  meta: { company: string; title: string; fileName: string };
  forecast: ForecastRow[];
  dintt: DinTT[];
  rton: { volume: RtonBlock[]; custos: RtonBlock[]; rston: RtonBlock[] };
  principais: Pc[];
};

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
const MONTH_LABEL: Record<string, string> = {
  "1": "Jan", "2": "Fev", "3": "Mar", "4": "Abr", "5": "Mai", "6": "Jun",
  "7": "Jul", "8": "Ago", "9": "Set", "10": "Out", "11": "Nov", "12": "Dez",
};

export default function Dashboard() {
  const STORAGE_KEY = "forecast.rows.v1";
  const [forecastRows, setForecastRows] = useState<ForecastRow[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return JSON.parse(saved) as ForecastRow[];
      } catch {}
    }
    return JSON.parse(JSON.stringify(D.forecast)) as ForecastRow[];
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(forecastRows)); } catch {}
  }, [forecastRows]);

  const units = useMemo(() => ["all", ...Array.from(new Set(forecastRows.map((r) => r.unit)))], [forecastRows]);
  const [unit, setUnit] = useState<string>("all");
  const [horizon, setHorizon] = useState<string>("5");

  const rowsFiltered = useMemo(
    () => forecastRows.filter((r) => unit === "all" || r.unit === unit),
    [unit, forecastRows],
  );

  const updateRow = (idx: number, field: "forecast" | "budget", month: string, val: string) => {
    setForecastRows((prev) => {
      const next = prev.slice();
      const row = { ...next[idx], [field]: { ...next[idx][field] } };
      const num = val === "" ? null : Number(val.replace(",", "."));
      row[field][month] = Number.isFinite(num as number) ? (num as number) : null;
      next[idx] = row;
      return next;
    });
  };
  const resetBase = () => setForecastRows(JSON.parse(JSON.stringify(D.forecast)) as ForecastRow[]);

  // KPIs: realizado YTD (1..4), forecast/budget para o horizonte selecionado
  const sumReal = rowsFiltered.reduce(
    (a, r) => a + [1, 2, 3, 4].reduce((s, m) => s + (r.real[String(m)] || 0), 0),
    0,
  );
  const sumForecast = rowsFiltered.reduce((a, r) => a + (r.forecast[horizon] || 0), 0);
  const sumBudget = rowsFiltered.reduce((a, r) => a + (r.budget[horizon] || 0), 0);
  const variance = sumForecast - sumBudget;
  const variancePct = sumBudget ? variance / sumBudget : 0;
  const sumM1 = rowsFiltered.reduce((a, r) => a + (r.m1 || 0), 0);

  // Evolução mensal (real meses 1-4, forecast 5-7) - agregado
  const monthly = useMemo(() => {
    const arr: { name: string; Realizado: number | null; Forecast: number | null; Budget: number | null }[] = [];
    for (let m = 1; m <= 7; m++) {
      const key = String(m);
      let real = 0, fc = 0, bud = 0, hasReal = false, hasFc = false, hasBud = false;
      rowsFiltered.forEach((r) => {
        if (r.real[key] != null) { real += r.real[key] as number; hasReal = true; }
        if (r.forecast[key] != null) { fc += r.forecast[key] as number; hasFc = true; }
        if (r.budget[key] != null) { bud += r.budget[key] as number; hasBud = true; }
      });
      arr.push({
        name: `${MONTH_LABEL[key]}/26`,
        Realizado: hasReal ? Math.round(real) : null,
        Forecast: hasFc ? Math.round(fc) : null,
        Budget: hasBud ? Math.round(bud) : null,
      });
    }
    return arr;
  }, [rowsFiltered]);

  // Por pacote
  const byPacote = useMemo(() => {
    const m = new Map<string, { name: string; Realizado: number; Forecast: number; Budget: number }>();
    rowsFiltered.forEach((r) => {
      const e = m.get(r.pacote) || { name: r.pacote, Realizado: 0, Forecast: 0, Budget: 0 };
      [1, 2, 3, 4].forEach((mo) => { e.Realizado += r.real[String(mo)] || 0; });
      e.Forecast += r.forecast[horizon] || 0;
      e.Budget += r.budget[horizon] || 0;
      m.set(r.pacote, e);
    });
    return Array.from(m.values()).sort((a, b) => (b.Realizado + b.Forecast) - (a.Realizado + a.Forecast));
  }, [rowsFiltered, horizon]);

  // Top desvios por subpacote (Forecast vs Budget) no horizonte
  const desvios = useMemo(() => {
    return rowsFiltered
      .map((r) => ({
        unit: r.unit,
        pacote: r.pacote,
        subpacote: r.subpacote || "—",
        forecast: r.forecast[horizon] || 0,
        budget: r.budget[horizon] || 0,
        delta: (r.forecast[horizon] || 0) - (r.budget[horizon] || 0),
      }))
      .filter((r) => Math.abs(r.delta) > 1000)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 12);
  }, [rowsFiltered, horizon]);

  // Por unidade (DIN TT)
  const unitTable = useMemo(() => {
    return D.dintt.filter((d) => d.unit !== "Total Geral").map((d) => {
      const fc = d.forecast[horizon];
      const bud = d.budget[horizon];
      return {
        unit: d.unit,
        forecast: fc,
        budget: bud,
        delta: fc != null && bud != null ? fc - bud : null,
        deltaPct: fc != null && bud != null && bud !== 0 ? (fc - bud) / bud : null,
      };
    });
  }, [horizon]);

  const pieByUnit = useMemo(() => {
    return D.dintt.filter((d) => d.unit !== "Total Geral").map((d) => ({
      name: d.unit,
      value: Math.round(d.forecast[horizon] || 0),
    }));
  }, [horizon]);

  // Volume vs custo (R$/TON)
  const rtonChart = useMemo(() => {
    return D.rton.rston.map((row) => ({
      name: row.unit.replace("CD ", ""),
      "R$/TON Forecast": Math.round((row.forecast05 || 0) * 100) / 100,
      "R$/TON Budget": Math.round((row.budget05 || 0) * 100) / 100,
    }));
  }, []);

  const volumeChart = useMemo(() => {
    return D.rton.volume.map((row) => ({
      name: row.unit.replace("CD ", ""),
      "Volume Forecast": Math.round(row.forecast05 || 0),
      "Volume Budget": Math.round(row.budget05 || 0),
    }));
  }, []);

  // Principais contas
  const topAccounts = useMemo(() => {
    return [...D.principais]
      .map((p) => ({
        ...p,
        total: [2, 3, 4].reduce((s, m) => s + (p.real[String(m)] || 0), 0),
      }))
      .filter((p) => unit === "all" || p.unit === unit)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [unit]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-[1600px] px-6 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              {D.meta.company} · Forecast 2026
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Painel de Forecast — Custos & Volume</h1>
            <p className="text-sm text-muted-foreground">Análise multi-CD: realizado, forecast, budget, desvios e R$/TON</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Unidade" /></SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u} value={u}>{u === "all" ? "Todas as unidades" : u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={horizon} onValueChange={setHorizon}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Horizonte" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="5">Mai/26</SelectItem>
                <SelectItem value="6">Jun/26</SelectItem>
                <SelectItem value="7">Jul/26</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-6 space-y-6">
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard icon={DollarSign} label="Realizado YTD" value={fmtBRL(sumReal)} hint="Jan–Abr/26" />
          <KpiCard icon={Target} label={`Forecast ${MONTH_LABEL[horizon]}/26`} value={fmtBRL(sumForecast)} />
          <KpiCard icon={Activity} label={`Budget ${MONTH_LABEL[horizon]}/26`} value={fmtBRL(sumBudget)} />
          <KpiCard icon={variance > 0 ? TrendingUp : TrendingDown}
            label="Desvio FC vs Bud" value={fmtBRL(variance)}
            tone={variance > 0 ? "bad" : "good"}
            hint={`${variancePct >= 0 ? "+" : ""}${fmtPct(variancePct)}`} />
          <KpiCard icon={AlertTriangle} label="Var. vs M-1" value={fmtBRL(sumM1)}
            tone={sumM1 > 0 ? "warn" : "good"} hint="ajuste do mês" />
        </section>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full md:w-auto">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="pacotes">Pacotes</TabsTrigger>
            <TabsTrigger value="desvios">Desvios</TabsTrigger>
            <TabsTrigger value="unidades">Unidades</TabsTrigger>
            <TabsTrigger value="rston">Volume & R$/TON</TabsTrigger>
            <TabsTrigger value="base">Base de Dados</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Evolução mensal — Realizado vs Forecast vs Budget</CardTitle>
                <CardDescription>Custos totais agregados, em R$</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={380}>
                  <ComposedChart data={monthly}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} />
                    <Tooltip formatter={(v: number) => fmtBRL(v)} />
                    <Legend />
                    <Bar dataKey="Realizado" fill="#2563eb" />
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
                  <CardDescription>{MONTH_LABEL[horizon]}/26 — comparação FC vs Budget</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={unitTable}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="unit" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} />
                      <Tooltip formatter={(v: number) => fmtBRL(v)} />
                      <Legend />
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
                  <ResponsiveContainer width="100%" height={320}>
                    <PieChart>
                      <Pie data={pieByUnit} dataKey="value" nameKey="name" innerRadius={60} outerRadius={110} paddingAngle={2}>
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
                <CardTitle>Custos por pacote</CardTitle>
                <CardDescription>Top pacotes consolidando YTD realizado, forecast e budget</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(360, byPacote.length * 26)}>
                  <BarChart data={byPacote.slice(0, 15)} layout="vertical" margin={{ left: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis dataKey="name" type="category" width={210} tick={{ fontSize: 11 }} />
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
                  Top desvios — Forecast vs Budget ({MONTH_LABEL[horizon]}/26)
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

            <Card>
              <CardHeader>
                <CardTitle>Principais contas — Realizado YTD</CardTitle>
                <CardDescription>Top 10 contas por custo acumulado Fev–Abr/26</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2 px-2">Unidade</th>
                      <th className="text-left py-2 px-2">Pacote</th>
                      <th className="text-left py-2 px-2">Subpacote</th>
                      <th className="text-right py-2 px-2">Realizado YTD</th>
                      <th className="text-right py-2 px-2">M-1</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topAccounts.map((p, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 px-2 font-medium">{p.unit.replace("CD ", "")}</td>
                        <td className="py-2 px-2 text-muted-foreground">{p.pacote}</td>
                        <td className="py-2 px-2">{p.subpacote}</td>
                        <td className="py-2 px-2 text-right tabular-nums font-semibold">{fmtBRL(p.total)}</td>
                        <td className={`py-2 px-2 text-right tabular-nums ${(p.m1 || 0) > 0 ? "text-red-600" : "text-green-600"}`}>
                          {p.m1 != null ? (p.m1 > 0 ? "+" : "") + fmtBRL(p.m1) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="unidades" className="space-y-4">
            <div className="grid md:grid-cols-3 gap-3">
              {unitTable.map((u) => (
                <Card key={u.unit}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />{u.unit}
                    </CardTitle>
                    <CardDescription>{MONTH_LABEL[horizon]}/26</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Forecast</span>
                      <span className="font-semibold tabular-nums">{fmtBRL(u.forecast)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Budget</span>
                      <span className="tabular-nums">{fmtBRL(u.budget)}</span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t">
                      <span className="text-muted-foreground">Desvio</span>
                      <Badge variant={(u.delta || 0) > 0 ? "destructive" : "secondary"}>
                        {(u.delta || 0) > 0 ? "+" : ""}{fmtBRL(u.delta || 0)} ({fmtPct(u.deltaPct || 0)})
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
                  <CardTitle>Volume (TON) — Mai/26</CardTitle>
                  <CardDescription>Forecast vs Budget por unidade</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={volumeChart}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} />
                      <Tooltip formatter={(v: number) => fmtNum(v)} />
                      <Legend />
                      <Bar dataKey="Volume Forecast" fill="#16a34a" />
                      <Bar dataKey="Volume Budget" fill="#94a3b8" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>R$/TON — Mai/26</CardTitle>
                  <CardDescription>Custo unitário por unidade</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={rtonChart}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => `R$ ${fmtNum(v, 2)}`} />
                      <Legend />
                      <Bar dataKey="R$/TON Forecast" fill="#2563eb" />
                      <Bar dataKey="R$/TON Budget" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Tabela detalhada — Volume, Custos e R$/TON</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2 px-2">Unidade</th>
                      <th className="text-right py-2 px-2">Vol. FC Mai</th>
                      <th className="text-right py-2 px-2">Vol. Bud Mai</th>
                      <th className="text-right py-2 px-2">Custo FC Mai</th>
                      <th className="text-right py-2 px-2">Custo Bud Mai</th>
                      <th className="text-right py-2 px-2">R$/TON FC</th>
                      <th className="text-right py-2 px-2">R$/TON Bud</th>
                    </tr>
                  </thead>
                  <tbody>
                    {D.rton.volume.map((v, i) => {
                      const c = D.rton.custos[i];
                      const r = D.rton.rston[i];
                      return (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 px-2 font-medium">{v.unit}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{fmtNum(v.forecast05)}</td>
                          <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{fmtNum(v.budget05)}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{fmtBRL(c.forecast05)}</td>
                          <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{fmtBRL(c.budget05)}</td>
                          <td className="py-2 px-2 text-right tabular-nums font-semibold">R$ {fmtNum(r.forecast05, 2)}</td>
                          <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">R$ {fmtNum(r.budget05, 2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="base" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-primary" />
                    Base de dados — Edição de Forecast & Budget
                  </CardTitle>
                  <CardDescription>
                    Edite os valores de Forecast e Budget (Mai/Jun/Jul). As alterações atualizam todos os gráficos e KPIs do painel automaticamente e são salvas no navegador.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Badge variant="secondary" className="gap-1"><Save className="h-3 w-3" />Auto-salvo</Badge>
                  <Button variant="outline" size="sm" onClick={resetBase}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restaurar original
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase text-muted-foreground border-b sticky top-0 bg-card">
                    <tr>
                      <th className="text-left py-2 px-2">Unidade</th>
                      <th className="text-left py-2 px-2">Pacote</th>
                      <th className="text-left py-2 px-2">Subpacote</th>
                      <th className="text-right py-2 px-2 bg-muted/40">FC Mai</th>
                      <th className="text-right py-2 px-2 bg-muted/40">FC Jun</th>
                      <th className="text-right py-2 px-2 bg-muted/40">FC Jul</th>
                      <th className="text-right py-2 px-2">Bud Mai</th>
                      <th className="text-right py-2 px-2">Bud Jun</th>
                      <th className="text-right py-2 px-2">Bud Jul</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecastRows
                      .map((r, idx) => ({ r, idx }))
                      .filter(({ r }) => unit === "all" || r.unit === unit)
                      .map(({ r, idx }) => (
                        <tr key={idx} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-1 px-2 font-medium whitespace-nowrap">{r.unit.replace("CD ", "")}</td>
                          <td className="py-1 px-2 text-muted-foreground whitespace-nowrap">{r.pacote}</td>
                          <td className="py-1 px-2 whitespace-nowrap">{r.subpacote || "—"}</td>
                          {(["5", "6", "7"] as const).map((m) => (
                            <td key={`f${m}`} className="py-1 px-1 bg-muted/20">
                              <Input
                                type="number"
                                value={r.forecast[m] ?? ""}
                                onChange={(e) => updateRow(idx, "forecast", m, e.target.value)}
                                className="h-7 text-right tabular-nums text-xs w-28 ml-auto"
                              />
                            </td>
                          ))}
                          {(["5", "6", "7"] as const).map((m) => (
                            <td key={`b${m}`} className="py-1 px-1">
                              <Input
                                type="number"
                                value={r.budget[m] ?? ""}
                                onChange={(e) => updateRow(idx, "budget", m, e.target.value)}
                                className="h-7 text-right tabular-nums text-xs w-28 ml-auto"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
                {unit === "all" && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Dica: use o filtro <strong>Unidade</strong> no topo para editar uma CD por vez ({forecastRows.length} linhas no total).
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <footer className="text-xs text-muted-foreground text-center pt-6">
          Fonte: {D.meta.fileName} · {D.forecast.length} linhas de forecast · {D.dintt.length} unidades · {D.principais.length} contas
        </footer>
      </main>
    </div>
  );
}
