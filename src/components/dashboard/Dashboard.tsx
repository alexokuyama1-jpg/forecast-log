import { useMemo, useState } from "react";
import data from "@/data/painel.json";
import KpiCard from "./KpiCard";
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, ComposedChart,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, Warehouse, TrendingUp, AlertTriangle, Users, Activity, Package, Clock } from "lucide-react";

type Shipment = { date: string; destination: string; shift: string | null; status: string | null; late: string | null };
type VolumeRow = { month: string; year: number; realizado: number | null; budget: number | null; forecast: number | null; unit: string | null };
type Occ = { date: string; cap_ref: number | null; occ_ref: number | null; pct_ref: number | null; cap_sec: number | null; occ_sec: number | null; pct_sec: number | null };
type Loss = { year: number | null; month: number | null; pacote: string | null; tipo: string | null; tipo1: string | null; mont: number | null; budget: number | null; manual: number | null };
type Fte = { activity: string | null; shift: string | null; role: string | null; situation: string | null; sector: string | null; tipo: string | null; qtd: number };

const D = data as unknown as {
  shipments: Shipment[]; volume: VolumeRow[]; occupation: Occ[]; losses: Loss[]; fte: Fte[]; meta: { cd: string; company: string; region: string };
};

const fmtInt = (v: number | null | undefined) =>
  v == null || isNaN(v as number) ? "—" : Math.round(v as number).toLocaleString("pt-BR");
const fmtPct = (v: number | null | undefined, d = 1) =>
  v == null || isNaN(v as number) ? "—" : `${((v as number) * 100).toFixed(d)}%`;
const fmtBRL = (v: number | null | undefined) =>
  v == null || isNaN(v as number) ? "—" : (v as number).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

export default function Dashboard() {
  const months = useMemo(() => {
    const set = new Set<string>();
    D.shipments.forEach((s) => s.date && set.add(s.date.slice(0, 7)));
    return ["all", ...Array.from(set).sort()];
  }, []);
  const [period, setPeriod] = useState<string>("all");
  const [destFilter, setDestFilter] = useState<string>("all");

  const shipFiltered = useMemo(() => {
    return D.shipments.filter(
      (s) =>
        (period === "all" || (s.date || "").startsWith(period)) &&
        (destFilter === "all" || s.destination === destFilter),
    );
  }, [period, destFilter]);

  const totalEmbarques = shipFiltered.length;
  const noPrazo = shipFiltered.filter((s) => s.late === "NO PRAZO").length;
  const otd = totalEmbarques ? noPrazo / totalEmbarques : 0;
  const naGrade = shipFiltered.filter((s) => s.status === "NA GRADE").length;
  const efetividade = totalEmbarques ? naGrade / totalEmbarques : 0;

  const lastOcc = D.occupation.filter((o) => o.cap_ref).slice(-1)[0];
  const occRefValid = D.occupation.filter((o) => o.pct_ref != null && (o.pct_ref as number) > 0);
  const occSecValid = D.occupation.filter((o) => o.pct_sec != null && (o.pct_sec as number) > 0);
  const occRefAvg = occRefValid.reduce((a, o) => a + (o.pct_ref as number), 0) / Math.max(1, occRefValid.length);
  const occSecAvg = occSecValid.reduce((a, o) => a + (o.pct_sec as number), 0) / Math.max(1, occSecValid.length);

  const ftePresentes = D.fte.filter((f) => f.tipo === "ATUAL" && f.situation === "TRABALHANDO").reduce((a, f) => a + f.qtd, 0);

  const lossesActual = D.losses.filter((l) => l.tipo1 !== "Budget").reduce((a, l) => a + (l.mont || 0) + (l.manual || 0), 0);
  const lossesBudget = D.losses.filter((l) => l.tipo1 === "Budget").reduce((a, l) => a + (l.budget || 0), 0);

  const volChart = useMemo(() => {
    return D.volume.map((v) => ({
      name: `${v.month}/${String(v.year).slice(2)}`,
      Realizado: v.realizado ? Math.round(v.realizado) : null,
      Budget: v.budget ? Math.round(v.budget) : null,
      Forecast: v.forecast ? Math.round(v.forecast) : null,
    }));
  }, []);

  const occChart = useMemo(() => {
    return D.occupation
      .filter((o) => o.cap_ref && o.pct_ref != null)
      .map((o) => ({
        date: o.date,
        "Refrigerado %": Math.round((o.pct_ref as number) * 100),
        "Seco %": Math.round((o.pct_sec as number) * 100),
      }));
  }, []);

  const destinations = useMemo(() => {
    const m = new Map<string, { dest: string; total: number; late: number }>();
    shipFiltered.forEach((s) => {
      const e = m.get(s.destination) || { dest: s.destination, total: 0, late: 0 };
      e.total += 1;
      if (s.late && s.late !== "NO PRAZO") e.late += 1;
      m.set(s.destination, e);
    });
    return Array.from(m.values())
      .map((d) => ({ ...d, atrasoPct: d.total ? (d.late / d.total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [shipFiltered]);

  const destOptions = useMemo(() => {
    return Array.from(new Set(D.shipments.map((s) => s.destination))).filter(Boolean).sort();
  }, []);

  const worstDest = [...destinations].sort((a, b) => b.atrasoPct - a.atrasoPct).filter((d) => d.total >= 3).slice(0, 10);

  const statusDist = useMemo(() => {
    const m = new Map<string, number>();
    shipFiltered.forEach((s) => {
      const k = s.status || "—";
      m.set(k, (m.get(k) || 0) + 1);
    });
    return Array.from(m, ([name, value]) => ({ name, value }));
  }, [shipFiltered]);

  const shiftDist = useMemo(() => {
    const m = new Map<string, number>();
    shipFiltered.forEach((s) => {
      const k = s.shift || "—";
      m.set(k, (m.get(k) || 0) + 1);
    });
    return Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => a.name.localeCompare(b.name));
  }, [shipFiltered]);

  const daily = useMemo(() => {
    const m = new Map<string, { date: string; total: number; noPrazo: number; atrasados: number }>();
    shipFiltered.forEach((s) => {
      const e = m.get(s.date) || { date: s.date, total: 0, noPrazo: 0, atrasados: 0 };
      e.total += 1;
      if (s.late === "NO PRAZO") e.noPrazo += 1;
      else e.atrasados += 1;
      m.set(s.date, e);
    });
    return Array.from(m.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [shipFiltered]);

  const fteByActivity = useMemo(() => {
    const m = new Map<string, number>();
    D.fte.filter((f) => f.tipo === "ATUAL" && f.situation === "TRABALHANDO").forEach((f) => {
      const k = f.activity || "—";
      m.set(k, (m.get(k) || 0) + f.qtd);
    });
    return Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, []);

  const fteByShift = useMemo(() => {
    const m = new Map<string, number>();
    D.fte.filter((f) => f.tipo === "ATUAL" && f.situation === "TRABALHANDO").forEach((f) => {
      const k = f.shift || "—";
      m.set(k, (m.get(k) || 0) + f.qtd);
    });
    return Array.from(m, ([name, value]) => ({ name, value }));
  }, []);

  const lossesByPkg = useMemo(() => {
    const m = new Map<string, { name: string; Realizado: number; Budget: number }>();
    D.losses.forEach((l) => {
      const k = l.pacote || "—";
      const e = m.get(k) || { name: k, Realizado: 0, Budget: 0 };
      if (l.tipo1 === "Budget") e.Budget += l.budget || 0;
      else e.Realizado += (l.mont || 0) + (l.manual || 0);
      m.set(k, e);
    });
    return Array.from(m.values()).sort((a, b) => (b.Realizado + b.Budget) - (a.Realizado + a.Budget));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-[1600px] px-6 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              {D.meta.company} · {D.meta.region}
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Painel Logístico — {D.meta.cd}</h1>
            <p className="text-sm text-muted-foreground">Performance operacional, ocupação, volume, perdas e mão-de-obra</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Período" /></SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>{m === "all" ? "Todo o período" : m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={destFilter} onValueChange={setDestFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Destino" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os destinos</SelectItem>
                {destOptions.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-6 space-y-6">
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard icon={Truck} label="Embarques" value={fmtInt(totalEmbarques)} hint="no período" />
          <KpiCard icon={Clock} label="OTD (No prazo)" value={fmtPct(otd)} tone={otd >= 0.95 ? "good" : otd >= 0.85 ? "warn" : "bad"} hint={`${noPrazo}/${totalEmbarques}`} />
          <KpiCard icon={Activity} label="Aderência grade" value={fmtPct(efetividade)} tone={efetividade >= 0.9 ? "good" : efetividade >= 0.7 ? "warn" : "bad"} hint={`${naGrade} na grade`} />
          <KpiCard icon={Warehouse} label="Ocupação Refrig." value={fmtPct(occRefAvg)} hint={`Cap ${fmtInt(lastOcc?.cap_ref)} pos`} tone={occRefAvg > 0.9 ? "bad" : occRefAvg > 0.75 ? "warn" : "good"} />
          <KpiCard icon={Package} label="Ocupação Seco" value={fmtPct(occSecAvg)} hint={`Cap ${fmtInt(lastOcc?.cap_sec)} pos`} tone={occSecAvg > 0.9 ? "bad" : occSecAvg > 0.75 ? "warn" : "good"} />
          <KpiCard icon={Users} label="FTE ativo" value={fmtInt(ftePresentes)} hint="trabalhando" />
        </section>

        <Tabs defaultValue="ops" className="space-y-4">
          <TabsList className="grid grid-cols-3 md:grid-cols-5 w-full md:w-auto">
            <TabsTrigger value="ops">Operação</TabsTrigger>
            <TabsTrigger value="warehouse">Armazém</TabsTrigger>
            <TabsTrigger value="volume">Volume</TabsTrigger>
            <TabsTrigger value="losses">Perdas</TabsTrigger>
            <TabsTrigger value="fte">Mão-de-obra</TabsTrigger>
          </TabsList>

          <TabsContent value="ops" className="space-y-4">
            <div className="grid lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Embarques diários — On-time vs Atrasados</CardTitle>
                  <CardDescription>Volume diário de OCRs com status de pontualidade</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={daily}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="noPrazo" stackId="a" fill="#16a34a" name="No prazo" />
                      <Bar dataKey="atrasados" stackId="a" fill="#dc2626" name="Atrasados" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Status dos embarques</CardTitle>
                  <CardDescription>Distribuição por status de grade</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={statusDist} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2}>
                        {statusDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid lg:grid-cols-3 gap-4">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Top destinos por volume</CardTitle>
                  <CardDescription>OCRs e atrasados por destino</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={destinations.slice(0, 12)} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="dest" type="category" width={120} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="total" fill="#2563eb" name="OCRs" />
                      <Bar dataKey="late" fill="#dc2626" name="Atrasados" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" />Pior performance</CardTitle>
                  <CardDescription>Destinos com maior % de atraso (≥3 OCRs)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[350px] overflow-y-auto">
                    {worstDest.length === 0 && <p className="text-sm text-muted-foreground">Sem atrasos relevantes</p>}
                    {worstDest.map((d) => (
                      <div key={d.dest} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                        <div>
                          <div className="font-medium">{d.dest}</div>
                          <div className="text-xs text-muted-foreground">{d.late}/{d.total} OCRs</div>
                        </div>
                        <Badge variant={d.atrasoPct > 30 ? "destructive" : "secondary"}>{d.atrasoPct.toFixed(0)}%</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle>Distribuição por turno de saída</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={shiftDist}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#7c3aed" name="OCRs" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="warehouse" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Ocupação do armazém — Refrigerado vs Seco</CardTitle>
                <CardDescription>% de ocupação diária. Atenção a picos &gt; 90%.</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={380}>
                  <AreaChart data={occChart}>
                    <defs>
                      <linearGradient id="ref" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0891b2" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#0891b2" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="sec" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="Refrigerado %" stroke="#0891b2" fill="url(#ref)" />
                    <Area type="monotone" dataKey="Seco %" stroke="#f59e0b" fill="url(#sec)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="volume" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Volume mensal — Realizado vs Budget vs Forecast</CardTitle>
                <CardDescription>CD Carambeí · Volumes em unidades</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <ComposedChart data={volChart}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
                    <Tooltip formatter={(v: number) => v?.toLocaleString("pt-BR")} />
                    <Legend />
                    <Bar dataKey="Realizado" fill="#2563eb" />
                    <Bar dataKey="Budget" fill="#94a3b8" />
                    <Line type="monotone" dataKey="Forecast" stroke="#16a34a" strokeWidth={2} dot />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="losses" className="space-y-4">
            <div className="grid md:grid-cols-3 gap-3">
              <KpiCard icon={TrendingUp} label="Perdas realizadas" value={fmtBRL(lossesActual)} hint="acumulado" />
              <KpiCard icon={AlertTriangle} label="Budget perdas" value={fmtBRL(lossesBudget)} hint="planejado" />
              <KpiCard icon={Activity} label="Aderência ao budget"
                value={lossesBudget ? fmtPct(lossesActual / lossesBudget) : "—"}
                tone={lossesBudget && lossesActual / lossesBudget > 1 ? "bad" : "good"} />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Perdas por pacote</CardTitle>
                <CardDescription>Realizado vs Budget (R$)</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={380}>
                  <BarChart data={lossesByPkg} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis dataKey="name" type="category" width={170} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => fmtBRL(v)} />
                    <Legend />
                    <Bar dataKey="Realizado" fill="#dc2626" />
                    <Bar dataKey="Budget" fill="#94a3b8" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fte" className="space-y-4">
            <div className="grid lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>FTE por atividade</CardTitle>
                  <CardDescription>Colaboradores ativos por área</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={340}>
                    <BarChart data={fteByActivity} layout="vertical" margin={{ left: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#2563eb" name="FTE" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>FTE por turno</CardTitle>
                  <CardDescription>Distribuição da força de trabalho</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={340}>
                    <PieChart>
                      <Pie data={fteByShift} dataKey="value" nameKey="name" innerRadius={70} outerRadius={120} paddingAngle={2} label>
                        {fteByShift.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <footer className="text-xs text-muted-foreground text-center pt-6">
          Fonte: PAINEL.xlsb · {D.shipments.length} OCRs · {D.occupation.length} dias de ocupação · {D.fte.length} registros FTE
        </footer>
      </main>
    </div>
  );
}
