import { Metrics } from './types';

export const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export const PLATFORMS = ["Instagram","Facebook","TikTok"];

export const PLAT_COLORS: { [key: string]: string } = { 
  Instagram: "#E1306C", 
  Facebook: "#1877F2", 
  TikTok: "#00f2ea" 
};

export const DEFAULT_METRICS: Metrics = {
  Instagram: { cpm: 0.47, cpe: 0.16, cpc: 1.08, er: 1.03, ctr: 0.03 },
  Facebook: { cpm: 0.43, cpe: 0.25, cpc: 0.62, er: 0.51, ctr: 0.07 },
  TikTok: { cpm: 0.74, cpe: 0.28, cpc: 0.63, er: 0.53, ctr: 0.08 },
};