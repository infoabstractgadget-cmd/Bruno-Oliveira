import { Metrics } from './types';

export const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export const PLATFORMS = ["Instagram","Facebook","TikTok"];

export const PLAT_COLORS: { [key: string]: string } = {
  Instagram: "#E1306C",
  Facebook: "#1877F2",
  TikTok: "#00f2ea"
};

export const BRANDS = [
  "Água Serra da Estrela",
  "Compal",
  "Compal da Horta",
  "Frize",
  "Sumol",
  "Um Bongo",
];

export const BRAND_METRICS: { [brand: string]: Metrics } = {
  "Água Serra da Estrela": {
    Instagram: { cpm: 0.93, cpe: 0.17, cpc: 0.63, er: 0.57, ctr: 0.26 },
    Facebook:  { cpm: 0.88, cpe: 0.47, cpc: 0.19, er: 0.30, ctr: 0.14 },
    TikTok:    { cpm: 1.34, cpe: 0.31, cpc: 0.92, er: 0.44, ctr: 0.26 },
  },
  "Compal": {
    Instagram: { cpm: 1.06, cpe: 0.34, cpc: 0.63, er: 0.33, ctr: 0.07 },
    Facebook:  { cpm: 0.63, cpe: 0.59, cpc: 0.19, er: 0.11, ctr: 0.03 },
    TikTok:    { cpm: 1.28, cpe: 0.37, cpc: 0.92, er: 0.35, ctr: 0.23 },
  },
  "Compal da Horta": {
    Instagram: { cpm: 1.06, cpe: 0.29, cpc: 0.63, er: 0.36, ctr: 0.04 },
    Facebook:  { cpm: 0.84, cpe: 0.20, cpc: 0.19, er: 0.43, ctr: 0.12 },
    TikTok:    { cpm: 1.40, cpe: 0.40, cpc: 0.92, er: 0.35, ctr: 0.26 },
  },
  "Frize": {
    Instagram: { cpm: 1.12, cpe: 0.25, cpc: 0.63, er: 0.47, ctr: 0.06 },
    Facebook:  { cpm: 0.44, cpe: 0.68, cpc: 0.19, er: 0.07, ctr: 0.03 },
    TikTok:    { cpm: 1.27, cpe: 0.32, cpc: 0.92, er: 0.42, ctr: 0.18 },
  },
  "Sumol": {
    Instagram: { cpm: 1.26, cpe: 0.25, cpc: 0.63, er: 0.54, ctr: 0.14 },
    Facebook:  { cpm: 0.46, cpe: 0.45, cpc: 0.19, er: 0.11, ctr: 0.03 },
    TikTok:    { cpm: 1.27, cpe: 0.24, cpc: 0.92, er: 0.54, ctr: 0.37 },
  },
  "Um Bongo": {
    Instagram: { cpm: 1.88, cpe: 0.26, cpc: 0.63, er: 0.73, ctr: 0.05 },
    Facebook:  { cpm: 0.62, cpe: 0.89, cpc: 0.19, er: 0.07, ctr: 0.03 },
    TikTok:    { cpm: 1.48, cpe: 0.40, cpc: 0.92, er: 0.53, ctr: 0.16 },
  },
};

export const DEFAULT_METRICS: Metrics = {
  Instagram: { cpm: 1.22, cpe: 0.26, cpc: 0.63, er: 0.50, ctr: 0.10 },
  Facebook:  { cpm: 0.65, cpe: 0.55, cpc: 0.19, er: 0.18, ctr: 0.06 },
  TikTok:    { cpm: 1.34, cpe: 0.34, cpc: 0.92, er: 0.44, ctr: 0.24 },
};
