import React, { useState, useMemo } from "react";
import { MONTHS, PLATFORMS, PLAT_COLORS, DEFAULT_METRICS } from "./constants";
import { Cluster, Metrics, PlatformMetrics } from "./types";
import { exportToExcel } from "./utils/excel";
import { Card } from "./components/Card";
import { NumInput, Slider } from "./components/Inputs";
import { ValidationBadge, SparkBar, HeatMap } from "./components/Visuals";
import { MonthToggle } from "./components/MonthToggle";

function fmt(n: number, d = 0) { return (n || 0).toLocaleString("pt-PT", { minimumFractionDigits: d, maximumFractionDigits: d }) }
function fmtE(n: number) { return fmt(n) + " €" }

// ─── Seasonality Engine ───
function buildSeasonality(active: number[], focus: number[], intensity: string) {
  const base = active.map(a => a ? 1 : 0);
  const activeCount = base.filter(v => v).length;
  if (activeCount === 0) return Array(12).fill(0);

  const peakBoost = intensity === "alta" ? 3 : intensity === "media" ? 2 : 1.3;
  const weights = base.map((a, i) => {
    if (!a) return 0;
    if (focus.includes(i)) return peakBoost;
    return 1;
  });
  const sum = weights.reduce((s, v) => s + v, 0);
  return weights.map(w => w / sum);
}

export default function App() {
  const [step, setStep] = useState(0);

  // Step 0
  const [brandName, setBrandName] = useState("");
  const [budgetAnual, setBudgetAnual] = useState(35000);
  const [feePercent, setFeePercent] = useState(8.5);
  const [numConteudos, setNumConteudos] = useState(120);
  const [budgetPorPub, setBudgetPorPub] = useState(200);

  // Step 1
  const [objN, setObjN] = useState(40);
  const [objE, setObjE] = useState(40);
  const [objT, setObjT] = useState(20);
  const [pIG, setPIG] = useState(40);
  const [pFB, setPFB] = useState(15);
  const [pTT, setPTT] = useState(45);

  // Step 2: Clusters
  const [clusters, setClusters] = useState<Cluster[]>([
    { name: "Cluster Principal", weight: 50, active: Array(12).fill(1), focus: [], intensity: "media" },
    { name: "Cluster Secundário", weight: 30, active: Array(12).fill(1), focus: [], intensity: "baixa" },
    { name: "Cluster Sazonal", weight: 20, active: [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0], focus: [5, 6, 7], intensity: "alta" },
  ]);

  // Step 3
  const [metrics, setMetrics] = useState<Metrics>(JSON.parse(JSON.stringify(DEFAULT_METRICS)));

  // Computed
  const budgetMedia = budgetAnual * (1 - feePercent / 100);
  const totalObj = objN + objE + objT;
  const totalPlat = pIG + pFB + pTT;
  const totalCW = clusters.reduce((s, c) => s + c.weight, 0);
  const maxPubs = budgetPorPub > 0 ? Math.floor(budgetMedia / budgetPorPub) : 0;

  const monthlyData = useMemo(() => {
    return clusters.map(c => {
      const season = buildSeasonality(c.active, c.focus, c.intensity);
      const pubs = numConteudos * (c.weight / 100);
      return season.map(s => pubs * s);
    });
  }, [clusters, numConteudos]);

  const monthlyTotals = useMemo(() => MONTHS.map((_, mi) => monthlyData.reduce((s, r) => s + r[mi], 0)), [monthlyData]);

  const platPcts: { [key: string]: number } = { Instagram: pIG, Facebook: pFB, TikTok: pTT };

  const estimatedMetrics = useMemo(() => {
    const r: { [key: string]: { impressions: number; engagements: number; clicks: number } } = {};
    PLATFORMS.forEach(p => {
      const b = budgetMedia * (platPcts[p] / 100);
      const m = metrics[p];
      r[p] = { impressions: m.cpm > 0 ? (b / m.cpm) * 1000 : 0, engagements: m.cpe > 0 ? b / m.cpe : 0, clicks: m.cpc > 0 ? b / m.cpc : 0 };
    });
    return r;
  }, [budgetMedia, pIG, pFB, pTT, metrics, platPcts]);

  const totals = useMemo(() => {
    const t = { impressions: 0, engagements: 0, clicks: 0 };
    Object.values(estimatedMetrics).forEach((v: { impressions: number; engagements: number; clicks: number }) => { t.impressions += v.impressions; t.engagements += v.engagements; t.clicks += v.clicks });
    return t;
  }, [estimatedMetrics]);

  const updateCluster = (i: number, f: keyof Cluster, v: any) => setClusters(p => { const n = [...p]; n[i] = { ...n[i], [f]: v }; return n });
  const toggleActive = (ci: number, mi: number) => setClusters(p => {
    const n = [...p]; const a = [...n[ci].active]; a[mi] = a[mi] ? 0 : 1;
    const newFocus = n[ci].focus.filter(f => a[f]);
    n[ci] = { ...n[ci], active: a, focus: newFocus }; return n;
  });
  const toggleFocus = (ci: number, mi: number) => setClusters(p => {
    const n = [...p]; const f = [...n[ci].focus];
    const idx = f.indexOf(mi); idx >= 0 ? f.splice(idx, 1) : f.push(mi);
    n[ci] = { ...n[ci], focus: f }; return n;
  });

  const [exportMsg, setExportMsg] = useState("");
  const [exportData, setExportData] = useState<{ [key: string]: string } | null>(null);
  const [exportTab, setExportTab] = useState("");

  const handleExport = () => {
    try {
      const csvSheets = exportToExcel({
        brandName, budgetAnual, feePercent, budgetMedia, numConteudos,
        objNotoriedade: objN, objEngagement: objE, objTrafego: objT,
        platIG: pIG, platFB: pFB, platTT: pTT, platPcts,
        metrics, monthlyData, monthlyTotals,
        clusterNames: clusters.map(c => c.name),
      });
      setExportData(csvSheets);
      setExportTab(Object.keys(csvSheets)[0]);
      setExportMsg("✓ Dados prontos!");
      setTimeout(() => setExportMsg(""), 3000);
    } catch (e: any) {
      setExportMsg("✗ Erro: " + e.message);
      setTimeout(() => setExportMsg(""), 6000);
    }
  };

  const handleCopySheet = (sheetName: string) => {
    if (!exportData || !exportData[sheetName]) return;
    const tsv = (exportData[sheetName] as string).split("\n").map(line => {
      const cells = [];
      let cur = "", inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQ = !inQ }
        else if (ch === ',' && !inQ) { cells.push(cur); cur = "" }
        else { cur += ch }
      }
      cells.push(cur);
      return cells.join("\t");
    }).join("\n");
    navigator.clipboard.writeText(tsv).then(() => {
      setExportMsg(`✓ "${sheetName}" copiado!`);
      setTimeout(() => setExportMsg(""), 4000);
    }).catch(() => {
      setExportMsg("✗ Não foi possível copiar.");
      setTimeout(() => setExportMsg(""), 4000);
    });
  };

  const handleCopyAll = () => {
    if (!exportData) return;
    const all = Object.entries(exportData).map(([name, csv]) => {
      const tsv = (csv as string).split("\n").map(line => {
        const cells = []; let cur = "", inQ = false;
        for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') { inQ = !inQ } else if (ch === ',' && !inQ) { cells.push(cur); cur = "" } else { cur += ch } }
        cells.push(cur); return cells.join("\t");
      }).join("\n");
      return `=== ${name} ===\n${tsv}`;
    }).join("\n\n");
    navigator.clipboard.writeText(all).then(() => {
      setExportMsg("✓ Tudo copiado!");
      setTimeout(() => setExportMsg(""), 4000);
    }).catch(() => {
      setExportMsg("✗ Erro ao copiar.");
      setTimeout(() => setExportMsg(""), 4000);
    });
  };

  const steps = [
    { t: "Marca & Budget", icon: "💰" },
    { t: "Objetivos & Plataformas", icon: "🎯" },
    { t: "Clusters & Sazonalidade", icon: "📅" },
    { t: "Métricas", icon: "📈" },
    { t: "Dashboard & Exportar", icon: "🚀" },
  ];

  const canNext = () => {
    if (step === 0) return budgetAnual > 0 && numConteudos > 0;
    if (step === 1) return Math.abs(totalObj - 100) < 1 && Math.abs(totalPlat - 100) < 1;
    if (step === 2) return clusters.length > 0 && Math.abs(totalCW - 100) < 1;
    return true;
  };

  return (
    <div className="font-sans bg-slate-950 min-h-screen text-slate-200">

      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600 pt-6 pb-[18px] px-7 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[200px] h-[200px] bg-[radial-gradient(circle,rgba(255,255,255,0.06)_0%,transparent_70%)] pointer-events-none" />
        <div className="max-w-[1100px] mx-auto relative">
          <div className="text-[10px] uppercase tracking-[3px] text-white/50">SUMOL+COMPAL · Digital Hub</div>
          <h1 className="mt-1 text-2xl font-extrabold text-white -tracking-[0.5px]">Simulador Always On Media</h1>
          <div className="text-xs text-white/60 mt-0.5">Planeamento de Conteúdo & Media FMCG</div>
        </div>
      </div>

      {/* Steps nav */}
      <div className="max-w-[1100px] mx-auto pt-4 px-7">
        <div className="flex gap-1">
          {steps.map((s, i) => (
            <button key={i} onClick={() => setStep(i)} className={`
              flex-1 py-2 px-1.5 cursor-pointer transition-all duration-200 border-t border-l border-r rounded-t-lg
              ${i === step ? 'bg-slate-900 border-slate-800 border-b-2 border-b-indigo-500' : 'bg-transparent border-transparent border-b-2 border-b-transparent'}
            `}>
              <div className="text-[15px] text-center">{s.icon}</div>
              <div className={`text-[10px] text-center mt-0.5 ${i === step ? 'text-slate-200 font-bold' : 'text-slate-600 font-normal'}`}>{s.t}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-[1100px] mx-auto pt-4 px-7 pb-10">

        {/* ── Step 0: Brand & Budget ── */}
        {step === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card title="Identificação">
              <label className="text-[11px] text-slate-500 block mb-1">Nome da Marca / Produto</label>
              <input value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="Ex: COMPAL, Frize, B!"
                className="w-full py-[9px] px-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-[13px] outline-none mb-[14px] focus:border-indigo-500 transition-colors" />
              <label className="text-[11px] text-slate-500 block mb-1">Budget Anual (com Fee)</label>
              <NumInput value={budgetAnual} onChange={setBudgetAnual} min={1000} step={500} suffix="€" />
              <div className="mt-[14px]">
                <label className="text-[11px] text-slate-500 block mb-1">Fee de Agência</label>
                <NumInput value={feePercent} onChange={setFeePercent} min={0} max={50} step={0.5} suffix="%" />
              </div>
              <div className="mt-4 p-3 bg-slate-800 rounded-lg">
                <div className="text-[11px] text-slate-500">Budget Media Líquido</div>
                <div className="text-[22px] font-extrabold text-indigo-500">{fmtE(budgetMedia)}</div>
              </div>
            </Card>
            <Card title="Volume de Conteúdos">
              <label className="text-[11px] text-slate-500 block mb-1">Conteúdos Anuais</label>
              <NumInput value={numConteudos} onChange={setNumConteudos} min={1} suffix="conteúdos" />
              <div className="mt-[14px]">
                <label className="text-[11px] text-slate-500 block mb-1">Budget Médio Pretendido / Publicação</label>
                <NumInput value={budgetPorPub} onChange={setBudgetPorPub} min={10} step={10} suffix="€" />
              </div>
              <div className="mt-4 p-3 bg-slate-800 rounded-lg">
                <div className="text-[11px] text-slate-500">Máx. Publicações pelo Budget</div>
                <div className={`text-[22px] font-extrabold ${maxPubs >= numConteudos ? 'text-green-500' : 'text-amber-500'}`}>{maxPubs}</div>
                <div className={`text-[11px] mt-0.5 ${maxPubs >= numConteudos ? 'text-green-500' : 'text-amber-500'}`}>
                  {maxPubs >= numConteudos ? "✓ Budget suficiente" : `⚠ Budget suporta ${maxPubs} publicações`}
                </div>
              </div>
              <div className="mt-3 p-3 bg-slate-800 rounded-lg">
                <div className="text-[11px] text-slate-500">Investimento Médio Real / Publicação</div>
                <div className="text-lg font-bold text-slate-200">{fmtE(numConteudos > 0 ? budgetMedia / numConteudos : 0)}</div>
              </div>
            </Card>
          </div>
        )}

        {/* ── Step 1: Objectives & Platforms ── */}
        {step === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card title="Objetivos Media" accent={Math.abs(totalObj - 100) < 1 ? "#22c55e" : "#ef4444"} sub="Distribuição do investimento por objetivo">
              <Slider label="Notoriedade" sub="Impressões e alcance" value={objN} onChange={setObjN} color="#6366f1" amount={budgetMedia * objN / 100} />
              <Slider label="Engagement" sub="Interações" value={objE} onChange={setObjE} color="#8b5cf6" amount={budgetMedia * objE / 100} />
              <Slider label="Tráfego" sub="Cliques e visitas" value={objT} onChange={setObjT} color="#a855f7" amount={budgetMedia * objT / 100} />
              <ValidationBadge total={totalObj} />
            </Card>
            <Card title="Plataformas" accent={Math.abs(totalPlat - 100) < 1 ? "#22c55e" : "#ef4444"} sub="Distribuição do investimento por plataforma">
              <Slider label="Instagram" value={pIG} onChange={setPIG} color={PLAT_COLORS.Instagram} amount={budgetMedia * pIG / 100} />
              <Slider label="Facebook" value={pFB} onChange={setPFB} color={PLAT_COLORS.Facebook} amount={budgetMedia * pFB / 100} />
              <Slider label="TikTok" value={pTT} onChange={setPTT} color={PLAT_COLORS.TikTok} amount={budgetMedia * pTT / 100} />
              <ValidationBadge total={totalPlat} />
            </Card>
          </div>
        )}

        {/* ── Step 2: Clusters & Seasonality Q&A ── */}
        {step === 2 && (
          <div>
            <Card title="Clusters de Conteúdo" accent={Math.abs(totalCW - 100) < 1 ? "#22c55e" : "#ef4444"}
              sub="Para cada cluster, responda a 3 perguntas: Em que meses está ativo? Quais são os meses de pico? Qual a intensidade da concentração?">
              {clusters.map((c, i) => (
                <div key={i} className="bg-slate-800 rounded-[10px] p-4 border border-slate-700 mb-3">
                  {/* Cluster header */}
                  <div className="flex gap-2.5 items-center mb-[14px] flex-wrap">
                    <input value={c.name} onChange={e => updateCluster(i, "name", e.target.value)}
                      className="flex-1 min-w-[160px] py-2 px-3 bg-slate-900 border border-slate-700 rounded-md text-slate-200 text-[13px] font-semibold outline-none focus:border-indigo-500" />
                    <NumInput value={c.weight} onChange={v => updateCluster(i, "weight", v)} min={0} max={100} step={5} suffix="%" />
                    {clusters.length > 1 && (
                      <button onClick={() => setClusters(p => p.filter((_, j) => j !== i))} className="p-1.5 px-2.5 bg-red-500/10 hover:bg-red-500/20 rounded-md text-red-500 text-xs transition-colors">✕</button>
                    )}
                  </div>

                  {/* Q1: Active months */}
                  <div className="mb-3">
                    <div className="text-xs font-semibold text-slate-400 mb-1.5">
                      ① Em que meses este cluster está ativo? <span className="font-normal text-slate-500">(clique para ativar/desativar)</span>
                    </div>
                    <MonthToggle active={c.active} onChange={mi => toggleActive(i, mi)} focusMonths={c.focus} onFocusToggle={mi => toggleFocus(i, mi)} />
                    <div className="text-[10px] text-slate-500 mt-1">② Nos meses ativos, clique em "Pico?" para marcar os meses de maior intensidade (★)</div>
                  </div>

                  {/* Q3: Intensity */}
                  <div className="mb-2">
                    <div className="text-xs font-semibold text-slate-400 mb-1.5">
                      ③ Quão concentrado é o investimento nos meses de pico?
                    </div>
                    <div className="flex gap-1.5">
                      {["baixa", "media", "alta"].map(int => (
                        <button key={int} onClick={() => updateCluster(i, "intensity", int)} className={`
                          flex-1 py-2 border rounded-lg text-xs font-semibold capitalize transition-all duration-200
                          ${c.intensity === int ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300' : 'border-slate-700 bg-transparent text-slate-500'}
                        `}>
                          {int === "baixa" ? "Uniforme" : int === "media" ? "Moderada" : "Muito concentrada"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="mt-2.5 p-2 bg-slate-900 rounded-lg">
                    <div className="text-[10px] text-slate-500 mb-1">Pré-visualização da distribuição ({Math.round(numConteudos * c.weight / 100)} conteúdos)</div>
                    <SparkBar values={buildSeasonality(c.active, c.focus, c.intensity)} color="#6366f1" h={28} />
                    <div className="flex justify-between mt-1">
                      {MONTHS.map((m, mi) => <span key={mi} className={`text-[8px] flex-1 text-center ${c.active[mi] ? (c.focus.includes(mi) ? "text-amber-500 font-bold" : "text-slate-500") : "text-slate-900"}`}>{m}</span>)}
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-center mt-2">
                <button onClick={() => setClusters(p => [...p, { name: `Cluster ${p.length + 1}`, weight: 10, active: Array(12).fill(1), focus: [], intensity: "media" }])}
                  disabled={clusters.length >= 8}
                  className="py-2 px-4 bg-slate-800 border border-slate-700 rounded-lg text-indigo-500 text-xs font-semibold hover:bg-slate-700 transition-colors disabled:opacity-50">
                  + Adicionar Cluster
                </button>
                <ValidationBadge total={totalCW} />
              </div>
            </Card>

            {Math.abs(totalCW - 100) < 1 && (
              <Card title="Mapa de Calor · Conteúdos / Mês" className="mt-4" accent="#8b5cf6">
                <HeatMap data={monthlyData} labels={clusters.map(c => c.name)} totals={monthlyTotals} />
              </Card>
            )}
          </div>
        )}

        {/* ── Step 3: Metrics ── */}
        {step === 3 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {PLATFORMS.map(p => (
              <Card key={p} title={p} accent={PLAT_COLORS[p]}>
                {[
                  { k: "cpm", l: "CPM", s: "€", st: 0.01 }, { k: "cpe", l: "CPE", s: "€", st: 0.01 }, { k: "cpc", l: "CPC", s: "€", st: 0.01 },
                  { k: "er", l: "ER%", s: "%", st: 0.01 }, { k: "ctr", l: "CTR%", s: "%", st: 0.01 },
                ].map(m => (
                  <div key={m.k} className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-400 font-medium">{m.l}</span>
                    <NumInput
                      value={(metrics[p] as any)[m.k]}
                      onChange={v => setMetrics(prev => ({ ...prev, [p]: { ...prev[p], [m.k]: v } }))}
                      min={0} step={m.st} suffix={m.s}
                    />
                  </div>
                ))}
                <div className="border-t border-slate-800 pt-2.5 mt-1.5">
                  <div className="text-[10px] text-slate-500">Budget alocado</div>
                  <div className="text-[17px] font-extrabold" style={{ color: PLAT_COLORS[p] }}>{fmtE(budgetMedia * platPcts[p] / 100)}</div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* ── Step 4: Dashboard ── */}
        {step === 4 && (
          <div>
            {/* Export bar */}
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <div>
                <span className="text-lg font-extrabold text-slate-200">{brandName || "Media Plan"}</span>
                <span className="text-xs text-slate-500 ml-3">Always On · {numConteudos} conteúdos · {fmtE(budgetMedia)} media</span>
              </div>
              <div className="flex items-center gap-2.5">
                {exportMsg && <span className={`text-xs font-semibold transition-opacity duration-300 ${exportMsg.startsWith("✓") ? "text-green-500" : "text-red-500"}`}>{exportMsg}</span>}
                <button onClick={handleExport} className="py-2.5 px-6 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 rounded-lg text-white text-[13px] font-bold tracking-wide shadow-lg shadow-green-500/30 active:scale-95 transition-all transform">
                  📥 Exportar
                </button>
              </div>
            </div>

            {/* Export panel */}
            {exportData && (
              <Card title="Dados para Exportação" accent="#22c55e" className="mb-4"
                right={<button onClick={() => setExportData(null)} className="text-slate-500 hover:text-slate-300 text-base">✕</button>}>
                <div className="text-xs text-slate-400 mb-2.5">
                  O download .xlsx foi tentado automaticamente. Se não funcionou, copie os dados abaixo.
                </div>
                <div className="flex gap-1.5 mb-3 flex-wrap">
                  {Object.keys(exportData).map(name => (
                    <button key={name} onClick={() => setExportTab(name)} className={`
                      py-1.5 px-3.5 rounded-md text-[11px] font-semibold transition-all duration-200
                      ${exportTab === name ? 'bg-indigo-600 text-white' : 'bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-300'}
                    `}>{name}</button>
                  ))}
                  <div className="flex-1" />
                  <button onClick={() => handleCopySheet(exportTab)} className="py-1.5 px-3.5 rounded-md text-[11px] font-bold bg-green-500 hover:bg-green-600 text-white transition-colors">📋 Copiar folha</button>
                  <button onClick={handleCopyAll} className="py-1.5 px-3.5 rounded-md text-[11px] font-bold bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-300 transition-colors">📋 Copiar tudo</button>
                </div>
                {exportTab && exportData[exportTab] && (
                  <div className="bg-slate-950 rounded-lg p-3 max-h-[260px] overflow-auto border border-slate-800">
                    <table className="border-collapse text-[11px] whitespace-nowrap w-full">
                      <tbody>
                        {exportData[exportTab].split("\n").map((line, ri) => {
                          const cells = []; let cur = "", inQ = false;
                          for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') { inQ = !inQ } else if (ch === ',' && !inQ) { cells.push(cur); cur = "" } else { cur += ch } }
                          cells.push(cur);
                          return (
                            <tr key={ri}>
                              {cells.map((c, ci) => {
                                const isHeader = ri === 0 || (c && isNaN(Number(c.replace(',', '.'))) && !c.includes("%"));
                                return <td key={ci} className={`
                                  py-1 px-2 border-b border-slate-800
                                  ${isHeader ? 'text-slate-400 font-semibold' : 'text-slate-200'}
                                  ${!isNaN(Number(c.replace(',', '.'))) && c !== "" ? 'text-right' : 'text-left'}
                                `}>{c}</td>;
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}

            {/* KPIs */}
            <Card accent="#6366f1">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
                {[
                  { l: "Budget Media", v: fmtE(budgetMedia), c: "#6366f1" },
                  { l: "Conteúdos", v: fmt(numConteudos), c: "#8b5cf6", s: `${fmtE(numConteudos > 0 ? budgetMedia / numConteudos : 0)}/pub` },
                  { l: "Impressões", v: fmt(totals.impressions), c: "#a855f7" },
                  { l: "Engagements", v: fmt(totals.engagements), c: "#ec4899" },
                  { l: "Clicks", v: fmt(totals.clicks), c: "#f59e0b" },
                ].map(k => (
                  <div key={k.l} className="text-center">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">{k.l}</div>
                    <div className="text-xl font-extrabold" style={{ color: k.c }}>{k.v}</div>
                    {k.s && <div className="text-[10px] text-slate-500 mt-0.5">{k.s}</div>}
                  </div>
                ))}
              </div>
            </Card>

            {/* Platform cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-3.5">
              {PLATFORMS.map(p => {
                const em = estimatedMetrics[p];
                const pPct = platPcts[p] / 100;
                return (
                  <Card key={p} title={p} accent={PLAT_COLORS[p]}>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div><div className="text-[9px] text-slate-500">Budget</div><div className="text-[14px] font-extrabold" style={{ color: PLAT_COLORS[p] }}>{fmtE(budgetMedia * pPct)}</div></div>
                      <div><div className="text-[9px] text-slate-500">Impressões</div><div className="text-[14px] font-bold text-slate-200">{fmt(em.impressions)}</div></div>
                      <div><div className="text-[9px] text-slate-500">Engagements</div><div className="text-[14px] font-bold text-slate-200">{fmt(em.engagements)}</div></div>
                      <div><div className="text-[9px] text-slate-500">Clicks</div><div className="text-[14px] font-bold text-slate-200">{fmt(em.clicks)}</div></div>
                    </div>
                    <div className="mt-2.5">
                      <div className="text-[9px] text-slate-500 mb-1">Publicações / mês</div>
                      <SparkBar values={monthlyTotals.map(t => t * pPct)} color={PLAT_COLORS[p]} h={32} />
                      <div className="flex mt-1">{MONTHS.map(m => <span key={m} className="text-[7px] text-slate-600 flex-1 text-center">{m}</span>)}</div>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Heatmap */}
            <Card title="Distribuição de Conteúdos · Cluster × Mês" className="mt-3.5" accent="#8b5cf6">
              <HeatMap data={monthlyData} labels={clusters.map(c => c.name)} totals={monthlyTotals} />
            </Card>

            {/* Budget mensal */}
            <Card title="Budget Mensal" className="mt-3.5" accent="#a855f7">
              <div className="flex gap-1.5 items-end">
                {monthlyTotals.map((t, i) => {
                  const totalP = monthlyTotals.reduce((s, v) => s + v, 0);
                  const b = totalP > 0 ? budgetMedia * (t / totalP) : 0;
                  const maxB = Math.max(...monthlyTotals.map(tt => totalP > 0 ? budgetMedia * (tt / totalP) : 0), 1);
                  return (
                    <div key={i} className="flex-1 text-center group">
                      <div className="text-[9px] font-bold text-indigo-300 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">{fmtE(b)}</div>
                      <div className="w-full bg-gradient-to-t from-indigo-600 to-purple-500 rounded-t-[3px] transition-[height] duration-300 hover:brightness-110"
                        style={{ height: `${Math.max((b / maxB) * 100, 4)}px` }} />
                      <div className="text-[9px] text-slate-500 mt-1">{MONTHS[i]}</div>
                      <div className="text-[8px] text-slate-600">{Math.round(t)} pub</div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Objectives */}
            <Card title="Investimento por Objetivo" className="mt-3.5" accent="#ec4899">
              <div className="grid grid-cols-3 gap-3.5">
                {[{ l: "Notoriedade", p: objN, c: "#6366f1" }, { l: "Engagement", p: objE, c: "#8b5cf6" }, { l: "Tráfego", p: objT, c: "#a855f7" }].map(o => (
                  <div key={o.l} className="text-center">
                    <div className="text-[11px] text-slate-400 mb-1">{o.l}</div>
                    <div className="text-[22px] font-extrabold" style={{ color: o.c }}>{o.p}%</div>
                    <div className="text-xs text-slate-500">{fmtE(budgetMedia * o.p / 100)}</div>
                    <div className="mt-1.5 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${o.p}%`, background: o.c }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-5">
          <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
            className={`
              py-2.5 px-6 rounded-lg text-xs font-semibold border transition-colors
              ${step === 0 ? 'bg-slate-900 border-slate-700 text-slate-600 cursor-default' : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 cursor-pointer'}
            `}>
            ← Anterior
          </button>
          {step < 4 && (
            <button onClick={() => setStep(step + 1)} disabled={!canNext()}
              className={`
                py-2.5 px-6 rounded-lg text-xs font-bold border-none transition-all
                ${canNext() ? 'bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white cursor-pointer shadow-md' : 'bg-slate-900 text-slate-700 cursor-default'}
              `}>
              Seguinte →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}