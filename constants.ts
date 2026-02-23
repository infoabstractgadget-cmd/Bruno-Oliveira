import { Metrics } from './types';

export const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export const PLATFORMS = ["Instagram","Facebook","TikTok"];

export const PLAT_COLORS: { [key: string]: string } = {
  Instagram: "#E1306C",
  Facebook: "#1877F2",
  TikTok: "#00f2ea"
};

export const DEFAULT_METRICS: Metrics = {
  Instagram: { cpm: 1.22, cpe: 0.26, cpc: 0.63, er: 0.50, ctr: 0.10 },
  Facebook: { cpm: 0.65, cpe: 0.55, cpc: 0.19, er: 0.18, ctr: 0.06 },
  TikTok: { cpm: 1.34, cpe: 0.34, cpc: 0.92, er: 0.44, ctr: 0.24 },
};
