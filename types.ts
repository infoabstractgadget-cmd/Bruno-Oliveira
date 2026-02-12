export interface PlatformMetrics {
  cpm: number;
  cpe: number;
  cpc: number;
  er: number;
  ctr: number;
}

export interface Metrics {
  [key: string]: PlatformMetrics;
}

export interface Cluster {
  name: string;
  weight: number;
  active: number[]; // Array of 0 or 1, length 12
  focus: number[]; // Array of month indices
  intensity: "baixa" | "media" | "alta";
}

export interface ExportConfig {
  brandName: string;
  budgetAnual: number;
  feePercent: number;
  budgetMedia: number;
  numConteudos: number;
  objNotoriedade: number;
  objEngagement: number;
  objTrafego: number;
  platIG: number;
  platFB: number;
  platTT: number;
  platPcts: { [key: string]: number };
  metrics: Metrics;
  monthlyData: number[][];
  monthlyTotals: number[];
  clusterNames: string[];
}

export interface SheetData {
  name: string;
  data: (string | number | null)[][];
}