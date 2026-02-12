// perfume-backend/lib/aiFormulaService.ts
// ═══════════════════════════════════════════════════════════
// PROFESSIONAL PERFUMERY FORMULA ENGINE
// Core perfumery intelligence (DO NOT EXPOSE TO FRONTEND)
// ═══════════════════════════════════════════════════════════

/* ==========================================================
   TYPES
   ========================================================== */

export interface SteepingInfo {
  category: 'fast-stable' | 'medium-settle' | 'slow-evolving';
  minDays: number;
  maxDays: number;
  label: string;
  notes: string;
}

interface RawIngredient {
  name: string;
  percent: string;
  supplier: string;
  ifraLimit?: number;
  strength: number;
  cost: number;
  blendsWith: string[];
  role: 'hero' | 'backbone' | 'character' | 'lift';
  persistence: number;
  dominance: number;
}

interface FormulaIngredient {
  name: string;
  percent: string;
  supplier: string;
  normalizedPct?: number;
}

export interface FormulaResult {
  formula: Record<string, Record<'top' | 'heart' | 'base', FormulaIngredient[]>>;
  steeping: SteepingInfo;
  ingredientCount: number;
  ifraWarnings: string[];
  perfumerNotes: string[];
}

/* ==========================================================
   INTERNAL STATE
   ========================================================== */

let _lastMeta: { steeping: SteepingInfo; ingredientCount: number; ifraWarnings: string[]; perfumerNotes: string[] } | null = null;

/* ==========================================================
   CONFIG
   ========================================================== */

const USE_CLAUDE_API = false;
const CLAUDE_API_KEY = '';

/* ==========================================================
   HELPERS
   ========================================================== */

function ing(
  name: string, percent: string, supplier: string,
  opts: Partial<RawIngredient> & { strength: number; cost: number; blendsWith: string[] }
): RawIngredient {
  return {
    name, percent, supplier,
    strength: opts.strength, cost: opts.cost, blendsWith: opts.blendsWith,
    ifraLimit: opts.ifraLimit, role: opts.role ?? 'character',
    persistence: opts.persistence ?? 5, dominance: opts.dominance ?? 5,
  };
}

function parseMidpoint(s: string): number {
  const n = s.match(/[\d.]+/g);
  if (!n) return 3;
  return n.length === 1 ? parseFloat(n[0]) : (parseFloat(n[0]) + parseFloat(n[1])) / 2;
}

function makeRange(mid: number): string {
  const lo = Math.max(0.1, Math.round(mid * 0.7 * 10) / 10);
  const hi = Math.round(mid * 1.3 * 10) / 10;
  return `${lo}–${hi}%`;
}

function seededRng(seed: number) {
  let s = seed;
  return (offset = 0) => { s = ((s + offset) * 2654435761) % 2147483647; return Math.abs(s) / 2147483647; };
}

/* ==========================================================
   INGREDIENT DATABASE — FULL
   ========================================================== */

const INGREDIENT_DB: Record<string, Record<'top' | 'heart' | 'base', RawIngredient[]>> = {
  floral: {
    top: [
      ing('Neroli EO (Bitter Orange)', '2–4%', '🇪🇬 A. Fakhry & Co', { strength: 7, cost: 4, blendsWith: ['citrus', 'green', 'powdery'], role: 'lift', persistence: 6, dominance: 4 }),
      ing('Orange Blossom Absolute', '3–5%', '🇪🇬 Cairo Aromatic', { strength: 8, cost: 4, blendsWith: ['oriental', 'gourmand'], role: 'lift', persistence: 7, dominance: 5 }),
      ing('Petitgrain EO', '2–4%', '🇪🇬 A. Fakhry & Co', { strength: 5, cost: 2, blendsWith: ['aromatic', 'citrus'], role: 'lift', persistence: 5, dominance: 3 }),
    ],
    heart: [
      ing('Jasmine Absolute (Egyptian)', '4–6%', '🇪🇬 A. Fakhry & Co', { strength: 9, cost: 5, blendsWith: ['oriental', 'woody'], role: 'hero', persistence: 8, dominance: 8 }),
      ing('Rose Absolute (Turkish)', '3–5%', '🌍 Turkey', { strength: 8, cost: 5, blendsWith: ['spicy', 'woody', 'powdery'], role: 'hero', persistence: 8, dominance: 7 }),
      ing('Ylang Ylang Extra', '1–3%', '📦 Bulkaroma', { strength: 8, cost: 3, blendsWith: ['oriental', 'gourmand'], role: 'character', persistence: 6, dominance: 6 }),
      ing('Hedione', '5–10%', '📦 Fraterworks', { strength: 3, cost: 2, blendsWith: ['fresh', 'citrus', 'green'], role: 'backbone', persistence: 7, dominance: 2 }),
      ing('Geranium EO (Egyptian)', '2–4%', '🇪🇬 Cairo Aromatic', { strength: 6, cost: 2, blendsWith: ['aromatic', 'citrus'], role: 'character', persistence: 5, dominance: 4 }),
    ],
    base: [
      ing('Ambroxan', '2–4%', '📦 Fraterworks', { strength: 7, cost: 3, blendsWith: ['woody', 'fresh', 'clean'], role: 'backbone', persistence: 9, dominance: 6 }),
      ing('Musk Accord (white)', '3–5%', '📦 PerfumersWorld', { strength: 5, cost: 2, blendsWith: ['powdery', 'clean'], role: 'backbone', persistence: 8, dominance: 3 }),
    ],
  },
  woody: {
    top: [
      ing('Bergamot EO (Calabrian type)', '3–5%', '📦 Fraterworks', { strength: 6, cost: 3, blendsWith: ['citrus', 'aromatic'], role: 'lift', persistence: 4, dominance: 3 }),
      ing('Pink Pepper CO2', '1–2%', '📦 Fraterworks', { strength: 5, cost: 3, blendsWith: ['spicy', 'fresh'], role: 'lift', persistence: 5, dominance: 3 }),
      ing('Elemi EO', '1–3%', '📦 Bulkaroma', { strength: 5, cost: 2, blendsWith: ['citrus', 'fresh', 'incense'], role: 'lift', persistence: 6, dominance: 2 }),
      ing('Cardamom CO2', '1–2%', '🌍 Guatemala', { strength: 7, cost: 3, blendsWith: ['spicy', 'oriental', 'fresh'], role: 'lift', persistence: 6, dominance: 4 }),
    ],
    heart: [
      ing('Cedarwood Atlas EO', '5–8%', '🌍 Morocco', { strength: 6, cost: 2, blendsWith: ['floral', 'aromatic'], role: 'backbone', persistence: 7, dominance: 4 }),
      ing('Iso E Super', '5–15%', '📦 Fraterworks', { strength: 4, cost: 2, blendsWith: ['floral', 'fresh', 'oriental'], role: 'backbone', persistence: 9, dominance: 5 }),
      ing('Hinoki (Japanese Cypress)', '2–4%', '📦 PerfumersWorld', { strength: 5, cost: 4, blendsWith: ['green', 'fresh'], role: 'character', persistence: 6, dominance: 3 }),
      ing('Guaiac Wood EO', '3–5%', '📦 Bulkaroma', { strength: 5, cost: 3, blendsWith: ['smoky', 'leather'], role: 'character', persistence: 7, dominance: 4 }),
    ],
    base: [
      ing('Vetiver EO (Java)', '4–6%', '📦 Bulkaroma', { strength: 7, cost: 3, blendsWith: ['smoky', 'green'], role: 'hero', persistence: 9, dominance: 7 }),
      ing('Sandalwood (Australian)', '4–8%', '📦 PerfumersWorld', { strength: 7, cost: 5, blendsWith: ['floral', 'oriental', 'powdery'], role: 'hero', persistence: 9, dominance: 6 }),
      ing('Cashmeran', '3–5%', '📦 Fraterworks', { strength: 5, cost: 3, blendsWith: ['powdery', 'floral'], role: 'backbone', persistence: 8, dominance: 4 }),
      ing('Patchouli EO (Dark)', '3–6%', '📦 Bulkaroma', { strength: 8, cost: 2, blendsWith: ['oriental', 'gourmand'], role: 'hero', persistence: 9, dominance: 7 }),
    ],
  },
  oriental: {
    top: [
      ing('Saffron CO2', '0.5–1%', '🌍 Iran', { strength: 9, cost: 5, blendsWith: ['floral', 'woody'], role: 'character', persistence: 7, dominance: 7 }),
      ing('Cardamom CO2', '1–2%', '🌍 Guatemala', { strength: 7, cost: 3, blendsWith: ['spicy', 'fresh'], role: 'lift', persistence: 6, dominance: 4 }),
      ing('Pink Pepper EO', '1–2%', '📦 Fraterworks', { strength: 5, cost: 3, blendsWith: ['floral', 'citrus'], role: 'lift', persistence: 5, dominance: 3 }),
    ],
    heart: [
      ing('Oud Oil (Hindi type)', '1–3%', '🌍 UAE (Dubai)', { strength: 10, cost: 5, blendsWith: ['woody', 'smoky', 'leather'], role: 'hero', persistence: 10, dominance: 9 }),
      ing('Labdanum Absolute', '3–5%', '📦 Fraterworks', { strength: 7, cost: 3, blendsWith: ['woody', 'leather'], role: 'backbone', persistence: 8, dominance: 5 }),
      ing('Frankincense EO (Omani)', '2–4%', '🌍 Oman', { strength: 6, cost: 4, blendsWith: ['incense', 'woody'], role: 'character', persistence: 7, dominance: 4 }),
      ing('Rose Absolute (Taif type)', '2–4%', '🌍 Turkey', { strength: 8, cost: 5, blendsWith: ['floral', 'spicy'], role: 'character', persistence: 8, dominance: 6 }),
    ],
    base: [
      ing('Amber Accord (in-house blend)', '5–8%', '🇪🇬 MUSK Aromatics', { strength: 7, cost: 2, blendsWith: ['woody', 'powdery'], role: 'hero', persistence: 9, dominance: 7 }),
      ing('Benzoin Resinoid (Siam)', '3–5%', '📦 Bulkaroma', { strength: 6, cost: 2, blendsWith: ['gourmand', 'floral'], role: 'backbone', persistence: 8, dominance: 4 }),
      ing('Vanillin (natural-identical)', '2–4%', '📦 Fraterworks', { strength: 6, cost: 1, blendsWith: ['gourmand', 'floral'], role: 'backbone', persistence: 8, dominance: 5 }),
      ing('Mysore Sandalwood Accord', '3–5%', '📦 PerfumersWorld', { strength: 7, cost: 4, blendsWith: ['floral', 'powdery'], role: 'hero', persistence: 9, dominance: 6 }),
    ],
  },
  fresh: {
    top: [
      ing('Egyptian Lemon EO', '3–5%', '🇪🇬 A. Fakhry & Co', { strength: 7, cost: 1, blendsWith: ['citrus', 'aromatic'], role: 'lift', persistence: 3, dominance: 4 }),
      ing('Grapefruit EO (Pink)', '2–4%', '📦 Fraterworks', { strength: 6, cost: 2, blendsWith: ['citrus', 'floral'], role: 'lift', persistence: 3, dominance: 3 }),
      ing('Bergamot EO', '3–6%', '📦 Fraterworks', { strength: 6, cost: 2, blendsWith: ['floral', 'aromatic'], role: 'lift', persistence: 4, dominance: 3 }),
    ],
    heart: [
      ing('Dihydromyrcenol', '5–10%', '📦 Fraterworks', { strength: 5, cost: 1, blendsWith: ['woody', 'citrus'], role: 'backbone', persistence: 7, dominance: 4 }),
      ing('Hedione HC', '5–10%', '📦 Fraterworks', { strength: 3, cost: 2, blendsWith: ['floral', 'green'], role: 'backbone', persistence: 7, dominance: 2 }),
      ing('Lily of the Valley Accord', '3–5%', '📦 PerfumersWorld', { strength: 4, cost: 2, blendsWith: ['floral', 'green'], role: 'character', persistence: 5, dominance: 3 }),
    ],
    base: [
      ing('White Musk (Galaxolide)', '4–8%', '📦 Fraterworks', { strength: 5, cost: 1, blendsWith: ['clean', 'powdery'], role: 'backbone', persistence: 8, dominance: 3 }),
      ing('Ambroxan', '3–5%', '📦 Fraterworks', { strength: 7, cost: 3, blendsWith: ['woody', 'clean'], role: 'backbone', persistence: 9, dominance: 6 }),
    ],
  },
  citrus: {
    top: [
      ing('Bergamot EO (Italian)', '5–10%', '📦 Fraterworks', { strength: 7, cost: 2, blendsWith: ['floral', 'aromatic'], role: 'lift', persistence: 4, dominance: 4 }),
      ing('Blood Orange EO', '3–5%', '🇪🇬 A. Fakhry & Co', { strength: 7, cost: 1, blendsWith: ['gourmand', 'fresh'], role: 'lift', persistence: 3, dominance: 4 }),
      ing('Mandarin EO (Green)', '3–5%', '🇪🇬 Cairo Aromatic', { strength: 6, cost: 1, blendsWith: ['floral', 'fresh'], role: 'lift', persistence: 3, dominance: 3 }),
    ],
    heart: [
      ing('Neroli EO', '2–4%', '🇪🇬 A. Fakhry & Co', { strength: 7, cost: 4, blendsWith: ['floral', 'green'], role: 'character', persistence: 6, dominance: 5 }),
      ing('Petitgrain Bigarade', '3–5%', '🇪🇬 A. Fakhry & Co', { strength: 5, cost: 2, blendsWith: ['aromatic', 'woody'], role: 'backbone', persistence: 5, dominance: 3 }),
    ],
    base: [
      ing('Musk Ketone', '2–4%', '📦 Fraterworks', { strength: 4, cost: 2, blendsWith: ['clean', 'powdery'], role: 'backbone', persistence: 7, dominance: 2 }),
      ing('Cedarwood Virginia', '3–5%', '📦 Bulkaroma', { strength: 5, cost: 1, blendsWith: ['woody', 'fresh'], role: 'backbone', persistence: 7, dominance: 3 }),
    ],
  },
  gourmand: {
    top: [
      ing('Bergamot EO', '2–4%', '📦 Fraterworks', { strength: 6, cost: 2, blendsWith: ['citrus', 'floral'], role: 'lift', persistence: 4, dominance: 3 }),
      ing('Pink Pepper CO2', '1–2%', '📦 Fraterworks', { strength: 5, cost: 3, blendsWith: ['spicy', 'oriental'], role: 'lift', persistence: 5, dominance: 3 }),
    ],
    heart: [
      ing('Cacao Absolute', '2–4%', '📦 Fraterworks', { strength: 7, cost: 4, blendsWith: ['oriental', 'woody'], role: 'hero', persistence: 7, dominance: 6 }),
      ing('Coffee Absolute', '1–3%', '📦 Bulkaroma', { strength: 8, cost: 4, blendsWith: ['smoky', 'oriental'], role: 'hero', persistence: 7, dominance: 7 }),
      ing('Tonka Bean Absolute', '2–4%', '📦 Fraterworks', { strength: 7, cost: 3, blendsWith: ['oriental', 'powdery'], role: 'character', persistence: 7, dominance: 5 }),
    ],
    base: [
      ing('Vanillin (10% in DPG)', '5–8%', '📦 Fraterworks', { strength: 7, cost: 1, blendsWith: ['oriental', 'floral'], role: 'hero', persistence: 9, dominance: 6 }),
      ing('Ethyl Maltol', '0.5–1%', '📦 Fraterworks', { strength: 8, cost: 1, blendsWith: ['floral'], role: 'character', persistence: 7, dominance: 7 }),
      ing('Coumarin', '2–4%', '📦 Fraterworks', { strength: 6, cost: 1, blendsWith: ['aromatic', 'powdery'], role: 'backbone', persistence: 8, dominance: 4 }),
    ],
  },
  aromatic: {
    top: [
      ing('Lavender EO (French type)', '3–6%', '📦 Bulkaroma', { strength: 6, cost: 2, blendsWith: ['fresh', 'woody'], role: 'lift', persistence: 5, dominance: 4 }),
      ing('Rosemary EO (Egyptian)', '2–3%', '🇪🇬 Cairo Aromatic', { strength: 6, cost: 1, blendsWith: ['green', 'woody'], role: 'lift', persistence: 5, dominance: 4 }),
    ],
    heart: [
      ing('Clary Sage EO', '2–4%', '📦 Bulkaroma', { strength: 5, cost: 2, blendsWith: ['floral', 'woody'], role: 'character', persistence: 6, dominance: 3 }),
      ing('Geranium Bourbon', '3–5%', '🇪🇬 Cairo Aromatic', { strength: 6, cost: 2, blendsWith: ['floral', 'citrus'], role: 'backbone', persistence: 6, dominance: 4 }),
    ],
    base: [
      ing('Vetiver EO', '3–5%', '📦 Bulkaroma', { strength: 7, cost: 3, blendsWith: ['woody', 'smoky'], role: 'hero', persistence: 9, dominance: 7 }),
      ing('Oakmoss Absolute (IFRA safe)', '1–2%', '📦 Fraterworks', { strength: 7, cost: 4, blendsWith: ['woody', 'green'], role: 'character', persistence: 8, dominance: 5, ifraLimit: 1 }),
      ing('Coumarin', '2–4%', '📦 Fraterworks', { strength: 6, cost: 1, blendsWith: ['gourmand', 'powdery'], role: 'backbone', persistence: 8, dominance: 4 }),
    ],
  },
  smoky: {
    top: [
      ing('Black Pepper CO2', '1–2%', '📦 Fraterworks', { strength: 7, cost: 2, blendsWith: ['spicy', 'woody'], role: 'lift', persistence: 5, dominance: 5 }),
      ing('Elemi EO', '1–3%', '📦 Bulkaroma', { strength: 5, cost: 2, blendsWith: ['citrus', 'fresh', 'incense'], role: 'lift', persistence: 6, dominance: 2 }),
    ],
    heart: [
      ing('Cade EO (rectified)', '1–3%', '📦 Fraterworks', { strength: 8, cost: 3, blendsWith: ['leather', 'woody'], role: 'hero', persistence: 8, dominance: 7 }),
      ing('Nagarmotha EO', '2–4%', '📦 Bulkaroma', { strength: 6, cost: 2, blendsWith: ['woody', 'incense'], role: 'character', persistence: 7, dominance: 4 }),
      ing('Guaiac Wood EO', '3–5%', '📦 Bulkaroma', { strength: 5, cost: 3, blendsWith: ['woody', 'oriental'], role: 'backbone', persistence: 7, dominance: 4 }),
    ],
    base: [
      ing('Vetiver EO (Haiti)', '4–6%', '📦 Bulkaroma', { strength: 7, cost: 3, blendsWith: ['woody', 'green'], role: 'hero', persistence: 9, dominance: 7 }),
      ing('Labdanum Absolute', '3–5%', '📦 Fraterworks', { strength: 7, cost: 3, blendsWith: ['oriental', 'woody'], role: 'backbone', persistence: 8, dominance: 5 }),
    ],
  },
  spicy: {
    top: [
      ing('Cardamom CO2 (Guatemala)', '1–3%', '🌍 Guatemala', { strength: 7, cost: 3, blendsWith: ['oriental', 'fresh'], role: 'lift', persistence: 6, dominance: 5 }),
      ing('Ginger CO2', '1–2%', '📦 Bulkaroma', { strength: 6, cost: 2, blendsWith: ['citrus', 'fresh'], role: 'lift', persistence: 5, dominance: 4 }),
    ],
    heart: [
      ing('Saffron CO2', '0.5–1%', '🌍 Iran', { strength: 9, cost: 5, blendsWith: ['oriental', 'floral'], role: 'character', persistence: 7, dominance: 7 }),
      ing('Nutmeg EO', '1–2%', '📦 Bulkaroma', { strength: 6, cost: 2, blendsWith: ['woody', 'aromatic'], role: 'character', persistence: 5, dominance: 4 }),
    ],
    base: [
      ing('Benzoin Resinoid', '3–5%', '📦 Bulkaroma', { strength: 6, cost: 2, blendsWith: ['oriental', 'gourmand'], role: 'backbone', persistence: 8, dominance: 4 }),
      ing('Amber Accord', '4–6%', '🇪🇬 MUSK Aromatics', { strength: 7, cost: 2, blendsWith: ['oriental', 'woody'], role: 'hero', persistence: 9, dominance: 7 }),
    ],
  },
  powdery: {
    top: [
      ing('Bergamot EO', '3–4%', '📦 Fraterworks', { strength: 6, cost: 2, blendsWith: ['citrus', 'floral'], role: 'lift', persistence: 4, dominance: 3 }),
      ing('Aldehydes C-11 (undecylenic)', '0.5–1%', '📦 Fraterworks', { strength: 7, cost: 2, blendsWith: ['floral', 'clean'], role: 'character', persistence: 4, dominance: 6 }),
    ],
    heart: [
      ing('Iris Accord (Orris butter type)', '2–4%', '📦 Fraterworks', { strength: 7, cost: 5, blendsWith: ['floral', 'woody'], role: 'hero', persistence: 8, dominance: 6 }),
      ing('Heliotropin', '3–5%', '📦 Fraterworks', { strength: 5, cost: 1, blendsWith: ['gourmand', 'floral'], role: 'backbone', persistence: 6, dominance: 3 }),
    ],
    base: [
      ing('Musk (Ethylene Brassylate)', '5–8%', '📦 Fraterworks', { strength: 4, cost: 1, blendsWith: ['clean', 'floral'], role: 'backbone', persistence: 9, dominance: 2 }),
      ing('Tonka Bean Absolute', '2–3%', '📦 Fraterworks', { strength: 7, cost: 3, blendsWith: ['gourmand', 'aromatic'], role: 'character', persistence: 8, dominance: 5 }),
    ],
  },
  green: {
    top: [
      ing('Galbanum EO', '1–2%', '📦 Fraterworks', { strength: 8, cost: 3, blendsWith: ['floral', 'aromatic'], role: 'character', persistence: 5, dominance: 7 }),
      ing('Cis-3-Hexenol (leaf alcohol)', '0.5–1%', '📦 Fraterworks', { strength: 7, cost: 1, blendsWith: ['fresh', 'aquatic'], role: 'lift', persistence: 3, dominance: 5 }),
    ],
    heart: [
      ing('Fig Leaf Accord', '3–5%', '📦 PerfumersWorld', { strength: 5, cost: 3, blendsWith: ['woody', 'fresh'], role: 'hero', persistence: 6, dominance: 5 }),
      ing('Tea Accord (green)', '2–4%', '📦 PerfumersWorld', { strength: 4, cost: 2, blendsWith: ['fresh', 'aromatic'], role: 'character', persistence: 5, dominance: 3 }),
    ],
    base: [
      ing('Vetiver EO', '3–5%', '📦 Bulkaroma', { strength: 7, cost: 3, blendsWith: ['woody', 'smoky'], role: 'hero', persistence: 9, dominance: 7 }),
      ing('Oakmoss Absolute', '1–2%', '📦 Fraterworks', { strength: 7, cost: 4, blendsWith: ['woody', 'aromatic'], role: 'character', persistence: 8, dominance: 5, ifraLimit: 1 }),
    ],
  },
  aquatic: {
    top: [
      ing('Calone (Watermelon Ketone)', '0.5–1%', '📦 Fraterworks', { strength: 8, cost: 2, blendsWith: ['fresh', 'green'], role: 'character', persistence: 4, dominance: 7 }),
      ing('Lemon EO (Egyptian)', '3–5%', '🇪🇬 A. Fakhry & Co', { strength: 6, cost: 1, blendsWith: ['citrus', 'fresh'], role: 'lift', persistence: 3, dominance: 3 }),
    ],
    heart: [
      ing('Marine Accord (Helional)', '3–5%', '📦 Fraterworks', { strength: 5, cost: 2, blendsWith: ['fresh', 'green'], role: 'hero', persistence: 6, dominance: 5 }),
      ing('Dihydromyrcenol', '5–8%', '📦 Fraterworks', { strength: 5, cost: 1, blendsWith: ['fresh', 'citrus'], role: 'backbone', persistence: 7, dominance: 4 }),
    ],
    base: [
      ing('Ambroxan', '3–5%', '📦 Fraterworks', { strength: 7, cost: 3, blendsWith: ['woody', 'fresh'], role: 'backbone', persistence: 9, dominance: 6 }),
      ing('Driftwood Accord (Norlimbanol)', '2–3%', '📦 Fraterworks', { strength: 5, cost: 3, blendsWith: ['woody', 'smoky'], role: 'character', persistence: 7, dominance: 4 }),
    ],
  },
  leather: {
    top: [
      ing('Birch Tar (rectified)', '0.5–1%', '📦 Fraterworks', { strength: 9, cost: 3, blendsWith: ['smoky', 'woody'], role: 'character', persistence: 6, dominance: 8 }),
      ing('Juniper Berry EO', '1–2%', '📦 Bulkaroma', { strength: 5, cost: 2, blendsWith: ['aromatic', 'fresh'], role: 'lift', persistence: 5, dominance: 3 }),
    ],
    heart: [
      ing('Suede Accord (Safraleine)', '3–5%', '📦 Fraterworks', { strength: 6, cost: 3, blendsWith: ['floral', 'powdery'], role: 'hero', persistence: 7, dominance: 5 }),
      ing('Labdanum Absolute', '3–5%', '📦 Fraterworks', { strength: 7, cost: 3, blendsWith: ['oriental', 'woody'], role: 'backbone', persistence: 8, dominance: 5 }),
    ],
    base: [
      ing('Castoreum Accord', '1–2%', '📦 Fraterworks', { strength: 8, cost: 3, blendsWith: ['smoky', 'oriental'], role: 'character', persistence: 9, dominance: 7 }),
      ing('Styrax Resinoid', '2–3%', '📦 Bulkaroma', { strength: 7, cost: 2, blendsWith: ['smoky', 'oriental'], role: 'backbone', persistence: 8, dominance: 5 }),
    ],
  },
  clean: {
    top: [
      ing('Aldehydes C-12 (MNA)', '0.5–1%', '📦 Fraterworks', { strength: 7, cost: 2, blendsWith: ['floral', 'powdery'], role: 'character', persistence: 4, dominance: 6 }),
      ing('Linalyl Acetate', '3–5%', '📦 Fraterworks', { strength: 4, cost: 1, blendsWith: ['floral', 'fresh'], role: 'lift', persistence: 4, dominance: 2 }),
    ],
    heart: [
      ing('Hedione HC', '5–10%', '📦 Fraterworks', { strength: 3, cost: 2, blendsWith: ['floral', 'fresh'], role: 'backbone', persistence: 7, dominance: 2 }),
      ing('Lily of the Valley Accord', '3–5%', '📦 PerfumersWorld', { strength: 4, cost: 2, blendsWith: ['floral', 'green'], role: 'character', persistence: 5, dominance: 3 }),
    ],
    base: [
      ing('White Musk (Galaxolide)', '5–10%', '📦 Fraterworks', { strength: 5, cost: 1, blendsWith: ['powdery', 'floral'], role: 'hero', persistence: 9, dominance: 3 }),
      ing('Cashmeran', '3–5%', '📦 Fraterworks', { strength: 5, cost: 3, blendsWith: ['woody', 'powdery'], role: 'backbone', persistence: 8, dominance: 4 }),
    ],
  },
  incense: {
    top: [
      ing('Elemi EO', '1–3%', '📦 Bulkaroma', { strength: 5, cost: 2, blendsWith: ['citrus', 'fresh'], role: 'lift', persistence: 6, dominance: 2 }),
      ing('Pink Pepper CO2', '1–2%', '📦 Fraterworks', { strength: 5, cost: 3, blendsWith: ['spicy', 'fresh'], role: 'lift', persistence: 5, dominance: 3 }),
    ],
    heart: [
      ing('Frankincense EO (Boswellia sacra)', '3–6%', '🌍 Oman', { strength: 7, cost: 4, blendsWith: ['woody', 'oriental'], role: 'hero', persistence: 8, dominance: 6 }),
      ing('Myrrh EO (Somalian)', '2–4%', '🌍 Somalia', { strength: 7, cost: 3, blendsWith: ['oriental', 'woody'], role: 'character', persistence: 8, dominance: 5 }),
    ],
    base: [
      ing('Benzoin Resinoid', '3–5%', '📦 Bulkaroma', { strength: 6, cost: 2, blendsWith: ['oriental', 'gourmand'], role: 'backbone', persistence: 8, dominance: 4 }),
      ing('Sandalwood (Australian)', '3–5%', '📦 PerfumersWorld', { strength: 7, cost: 5, blendsWith: ['floral', 'oriental'], role: 'hero', persistence: 9, dominance: 6 }),
    ],
  },
  niche: {
    top: [
      ing('Galbanum EO', '1–2%', '📦 Fraterworks', { strength: 8, cost: 3, blendsWith: ['green', 'floral'], role: 'character', persistence: 5, dominance: 7 }),
      ing('Aldehydes C-11', '0.5–1%', '📦 Fraterworks', { strength: 7, cost: 2, blendsWith: ['clean', 'floral'], role: 'character', persistence: 4, dominance: 6 }),
    ],
    heart: [
      ing('Papyrus Accord', '3–5%', '📦 PerfumersWorld', { strength: 5, cost: 3, blendsWith: ['woody', 'green'], role: 'hero', persistence: 6, dominance: 4 }),
      ing('Ambrette Seed CO2', '2–3%', '📦 Bulkaroma', { strength: 5, cost: 4, blendsWith: ['floral', 'powdery'], role: 'character', persistence: 6, dominance: 3 }),
    ],
    base: [
      ing('Ambergris Accord (Ambroxan + Labdanum)', '3–5%', '📦 Fraterworks', { strength: 7, cost: 3, blendsWith: ['woody', 'oriental'], role: 'hero', persistence: 9, dominance: 6 }),
      ing('Iso E Super', '5–10%', '📦 Fraterworks', { strength: 4, cost: 2, blendsWith: ['woody', 'fresh'], role: 'backbone', persistence: 9, dominance: 5 }),
    ],
  },
};

/* ==========================================================
   CONTEXT MODIFIERS
   ========================================================== */

interface ContextModifiers {
  heroScale: number;
  projectionCap: number;
  muskBoost: number;
  topPersistMin: number;
  noteBalance: { top: number; heart: number; base: number };
}

function computeContext(concentration?: string, occasion?: string, intensity?: string): ContextModifiers {
  const ctx: ContextModifiers = {
    heroScale: 1, projectionCap: 12, muskBoost: 1,
    topPersistMin: 4, noteBalance: { top: 15, heart: 45, base: 40 },
  };
  if (concentration === 'Parfum Extrait') {
    ctx.heroScale = 1.3; ctx.muskBoost = 1.3; ctx.topPersistMin = 6;
    ctx.noteBalance = { top: 10, heart: 40, base: 50 };
  }
  if (intensity === 'Leave a trail') { ctx.heroScale *= 1.2; ctx.muskBoost *= 1.2; }
  if (occasion === 'Everyday signature') { ctx.projectionCap *= 0.8; }
  return ctx;
}

/* ==========================================================
   STEEPING ESTIMATION
   ========================================================== */

function estimateSteeping(ingredients: RawIngredient[], concentration?: string): SteepingInfo {
  let slowScore = 0;
  const slow = ['oud', 'labdanum', 'patchouli', 'myrrh', 'benzoin', 'styrax', 'amber', 'oakmoss'];
  ingredients.forEach(i => {
    const n = i.name.toLowerCase();
    if (slow.some(s => n.includes(s))) slowScore += 3;
    if (i.persistence >= 8) slowScore += 1;
    if (i.cost >= 4) slowScore += 1;
  });
  if (concentration === 'Parfum Extrait') slowScore *= 1.5;

  if (slowScore < 6) return { category: 'fast-stable', minDays: 1, maxDays: 3, label: '24–72 hours', notes: 'Mostly synthetic backbone. Stabilizes quickly. Evaluate after 48 hours.' };
  if (slowScore < 14) return { category: 'medium-settle', minDays: 7, maxDays: 14, label: '1–2 weeks', notes: 'Contains naturals/resins. Early sharpness softens within first week.' };
  return { category: 'slow-evolving', minDays: 14, maxDays: 42, label: '2–6 weeks', notes: 'Heavy naturals and resins. Do not judge before two weeks.' };
}

/* ==========================================================
   CORE ENGINE
   ========================================================== */

function generateLocalFormula(
  dominant: string, secondary: string, accent: string, scentCode: string,
  concentration?: string, occasion?: string, intensity?: string
): FormulaResult {
  const rng = seededRng(scentCode.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
  const ctx = computeContext(concentration, occasion, intensity);

  const used = new Set<string>();
  const picked: RawIngredient[] = [];
  const ifraWarnings: string[] = [];

  // ─── STEP 1: SELECT ONE HERO ──────────────
  // Look for hero-role ingredients first. If none exist (e.g. 'fresh' family),
  // promote the highest-persistence backbone or character ingredient.
  let heroPool = [
    ...(INGREDIENT_DB[dominant]?.base ?? []),
    ...(INGREDIENT_DB[dominant]?.heart ?? []),
  ].filter(i => i.role === 'hero');
  
  if (heroPool.length === 0) {
    // No hero-role ingredients — promote best backbone/character
    heroPool = [
      ...(INGREDIENT_DB[dominant]?.base ?? []),
      ...(INGREDIENT_DB[dominant]?.heart ?? []),
    ].sort((a, b) => b.persistence - a.persistence);
  }
  
  const hero = heroPool.length > 0 ? heroPool[Math.floor(rng() * Math.min(3, heroPool.length))] : null;
  const heroName = hero?.name;

  // ─── STEP 2: PICK HELPER ─────────────────
  function pick(pool: RawIngredient[], role: RawIngredient['role'], count: number, mult: number): FormulaIngredient[] {
    const out: FormulaIngredient[] = [];
    let cands = pool.filter(i => i.role === role && !used.has(i.name) && i.name !== heroName);
    if (cands.length === 0) cands = pool.filter(i => !used.has(i.name) && i.name !== heroName);

    // Score by synergy + seed variation + conflict penalty
    const scored = cands.map((c, idx) => {
      let score = 0;
      [dominant, secondary, accent].forEach(f => { if (c.blendsWith.includes(f)) score += 2; });
      score += rng(idx * 3) * 3;
      if (hero && c.dominance >= 7 && hero.dominance >= 7) score -= 4;
      return { ing: c, score };
    });
    scored.sort((a, b) => b.score - a.score);

    for (const s of scored.slice(0, count)) {
      used.add(s.ing.name);
      picked.push(s.ing);
      const mid = parseMidpoint(s.ing.percent) * mult;
      if (s.ing.ifraLimit && mid > s.ing.ifraLimit) {
        ifraWarnings.push(`${s.ing.name} capped at ${s.ing.ifraLimit}% (IFRA)`);
      }
      out.push({ name: s.ing.name, percent: makeRange(mid), supplier: s.ing.supplier, normalizedPct: mid });
    }
    return out;
  }

  // ─── STEP 3: DOMINANT FAMILY ──────────────
  const formula: FormulaResult['formula'] = {};
  const dom = INGREDIENT_DB[dominant];
  if (dom) {
    if (hero) {
      used.add(hero.name);
      picked.push(hero);
    }
    
    // Cap heroScale to prevent extreme percentages (Parfum Extrait + "Leave a trail" was 1.56x)
    const cappedHeroScale = Math.min(ctx.heroScale, 1.3);

    // Top: pick most persistent lifter, add booster if weak
    const topPool = (dom.top ?? []).filter(i => !used.has(i.name));
    topPool.sort((a, b) => b.persistence - a.persistence);
    const domTop: FormulaIngredient[] = [];
    if (topPool.length > 0) {
      const t = topPool[Math.floor(rng(10) * Math.min(2, topPool.length))];
      used.add(t.name); picked.push(t);
      domTop.push({ name: t.name, percent: t.percent, supplier: t.supplier });
      // Persistence booster if top < 5
      if (t.persistence < 5 && topPool.length > 1) {
        const booster = topPool.find(x => !used.has(x.name) && x.persistence >= 5);
        if (booster) { used.add(booster.name); picked.push(booster); domTop.push({ name: booster.name, percent: booster.percent, supplier: booster.supplier }); }
      }
    }

    // Heart: hero (if heart note) + backbone
    const heroInHeart = hero ? (dom.heart ?? []).find(i => i.name === heroName) : null;
    const heroInBase = hero ? (dom.base ?? []).find(i => i.name === heroName) : null;
    const domHeart: FormulaIngredient[] = [];
    if (heroInHeart) {
      domHeart.push({ name: heroName!, percent: makeRange(parseMidpoint(heroInHeart.percent) * cappedHeroScale), supplier: heroInHeart.supplier });
    }
    // When hero is in base, give heart 1 backbone at reduced strength (hero carries the weight)
    const heartBackboneCount = heroInHeart ? 1 : (heroInBase ? 1 : 2);
    const heartBackboneMult = heroInBase ? 0.75 : 1;
    domHeart.push(...pick(dom.heart ?? [], 'backbone', heartBackboneCount, heartBackboneMult));

    // Base: hero (if base note) + backbone at reduced strength
    const domBase: FormulaIngredient[] = [];
    if (heroInBase && !heroInHeart) {
      domBase.push({ name: heroName!, percent: makeRange(parseMidpoint(heroInBase.percent) * cappedHeroScale), supplier: heroInBase.supplier });
    }
    const baseBackboneMult = heroInBase ? ctx.muskBoost * 0.7 : ctx.muskBoost;
    domBase.push(...pick(dom.base ?? [], 'backbone', 1, baseBackboneMult));

    formula[dominant] = { top: domTop, heart: domHeart, base: domBase };
  }

  // ─── STEP 4: SECONDARY FAMILY ─────────────
  const sec = INGREDIENT_DB[secondary];
  if (sec) {
    formula[secondary] = {
      top: pick(sec.top ?? [], 'lift', 1, 0.8),
      heart: pick(sec.heart ?? [], 'backbone', 1, 0.7),
      base: pick(sec.base ?? [], 'backbone', 1, 0.6),
    };
  }

  // ─── STEP 5: ACCENT FAMILY ────────────────
  const acc = INGREDIENT_DB[accent];
  if (acc) {
    const accPick = pick([...(acc.heart ?? []), ...(acc.base ?? [])], 'character', 1, 0.5);
    const accHeart: FormulaIngredient[] = [];
    const accBase: FormulaIngredient[] = [];
    accPick.forEach(a => {
      if ((acc.heart ?? []).some(h => h.name === a.name)) accHeart.push(a); else accBase.push(a);
    });
    formula[accent] = { top: [], heart: accHeart, base: accBase };
  }

  // ─── STEP 5b: INGREDIENT FLOOR (9+ for heavy families) ──────
  const heavyFamilies = ['oriental', 'woody', 'smoky', 'leather', 'incense', 'gourmand', 'spicy'];
  const isHeavy = heavyFamilies.includes(dominant);
  let currentCount = 0;
  Object.values(formula).forEach(layers => {
    currentCount += layers.top.length + layers.heart.length + layers.base.length;
  });

  if (isHeavy && currentCount < 9) {
    const fillSources = [
      ...(INGREDIENT_DB[secondary]?.heart ?? []),
      ...(INGREDIENT_DB[accent]?.heart ?? []),
      ...(INGREDIENT_DB[secondary]?.base ?? []),
      ...(INGREDIENT_DB[accent]?.base ?? []),
    ].filter(i => !used.has(i.name) && i.role === 'character');

    const scored = fillSources.map((c, idx) => {
      let score = 0;
      [dominant, secondary, accent].forEach(f => { if (c.blendsWith.includes(f)) score += 2; });
      score += rng(idx * 7 + 99) * 2;
      return { ing: c, score };
    });
    scored.sort((a, b) => b.score - a.score);

    const needed = Math.min(scored.length, 9 - currentCount);
    for (let fi = 0; fi < needed; fi++) {
      const fill = scored[fi].ing;
      used.add(fill.name);
      picked.push(fill);
      const mid = parseMidpoint(fill.percent) * 0.4;
      const item: FormulaIngredient = { name: fill.name, percent: makeRange(mid), supplier: fill.supplier, normalizedPct: mid };
      const inSec = [...(INGREDIENT_DB[secondary]?.heart ?? []), ...(INGREDIENT_DB[secondary]?.base ?? [])].some(i => i.name === fill.name);
      const targetFam = inSec ? secondary : accent;
      if (!formula[targetFam]) formula[targetFam] = { top: [], heart: [], base: [] };
      const inHeart = (INGREDIENT_DB[targetFam]?.heart ?? []).some(h => h.name === fill.name);
      if (inHeart) formula[targetFam].heart.push(item); else formula[targetFam].base.push(item);
    }
  }

  // Declare perfumerNotes early — needed by Step 5c and Step 6+
  const perfumerNotes: string[] = [];

  // ─── STEP 5c: STRUCTURAL BACKBONE INJECTION (RETAIL SAFETY NET) ──────────
  const heavyFamiliesForStructure = ['oriental', 'woody', 'smoky', 'leather', 'incense', 'gourmand', 'spicy'];
  const totalIngredientsCount = () => {
    let c = 0;
    Object.values(formula).forEach(l =>
      c += l.top.length + l.heart.length + l.base.length
    );
    return c;
  };
  if (
    heavyFamiliesForStructure.includes(dominant) &&
    totalIngredientsCount() < 7 &&
    estimateSteeping(picked, concentration).category !== 'fast-stable'
  ) {
    const structuralCandidates = [
      ...(INGREDIENT_DB.clean?.base ?? []),
      ...(INGREDIENT_DB.woody?.heart ?? []),
      ...(INGREDIENT_DB.woody?.base ?? []),
    ].filter(i =>
      i.role === 'backbone' &&
      !used.has(i.name) &&
      i.blendsWith.includes(dominant)
    );
    // Prefer diffusers over musks
    structuralCandidates.sort((a, b) => {
      if (a.name.includes('Ambroxan')) return -1;
      if (b.name.includes('Ambroxan')) return 1;
      if (a.name.includes('Iso E')) return -1;
      if (b.name.includes('Iso E')) return 1;
      return a.persistence - b.persistence;
    });
    const injectCount = Math.min(2, 8 - totalIngredientsCount());
    for (let i = 0; i < injectCount; i++) {
      const s = structuralCandidates[i];
      if (!s) break;
      used.add(s.name);
      picked.push(s);
      const mid = parseMidpoint(s.percent) * 0.4; // support role
      const item: FormulaIngredient = {
        name: s.name,
        percent: makeRange(mid),
        supplier: s.supplier,
        normalizedPct: mid,
      };
      // Prefer base placement for structure
      if (!formula[dominant]) {
        formula[dominant] = { top: [], heart: [], base: [] };
      }
      formula[dominant].base.push(item);
      perfumerNotes.push(
        `${s.name} added at low dose as structural backbone — improves diffusion and polish`
      );
    }
  }

  // ─── STEP 6: CONFLICT RESOLUTION (AUTO-CORRECTION) ──────────

  function getUpperPct(item: FormulaIngredient): number {
    const nums = item.percent.match(/[\d.]+/g);
    return nums && nums.length >= 2 ? parseFloat(nums[nums.length - 1]) : 0;
  }
  function getLowerPct(item: FormulaIngredient): number {
    const nums = item.percent.match(/[\d.]+/g);
    return nums ? parseFloat(nums[0]) : 0;
  }

  // 6a: High-dominance conflict — reduce non-hero high-dominance to 40%
  let highDom = 0;
  Object.entries(formula).forEach(([fam, layers]) => {
    ['heart', 'base'].forEach(layer => {
      (layers[layer as 'heart' | 'base'] ?? []).forEach(item => {
        const orig = [...(INGREDIENT_DB[fam]?.heart ?? []), ...(INGREDIENT_DB[fam]?.base ?? [])].find(i => i.name === item.name);
        if (orig && orig.dominance >= 7) highDom++;
      });
    });
  });
  if (highDom > 1) {
    Object.entries(formula).forEach(([fam, layers]) => {
      ['heart', 'base'].forEach(layer => {
        const items = layers[layer as 'heart' | 'base'];
        items.forEach((item, idx) => {
          if (item.name === heroName) return;
          const orig = [...(INGREDIENT_DB[fam]?.heart ?? []), ...(INGREDIENT_DB[fam]?.base ?? [])].find(i => i.name === item.name);
          if (orig && orig.dominance >= 7) {
            const lo = getLowerPct(item);
            const hi = getUpperPct(item);
            items[idx] = { ...item, percent: `${Math.round(lo * 0.4 * 10) / 10}–${Math.round(hi * 0.4 * 10) / 10}%` };
          }
        });
      });
    });
  }

  // 6b: Non-hero cap at 6.5%
  Object.entries(formula).forEach(([_fam, layers]) => {
    ['heart', 'base'].forEach(layer => {
      const items = layers[layer as 'heart' | 'base'];
      items.forEach((item, idx) => {
        if (item.name === heroName) return;
        if (getUpperPct(item) > 6.5) {
          const lo = Math.min(getLowerPct(item), 3.5);
          const hi = Math.min(getUpperPct(item), 6.5);
          items[idx] = { ...item, percent: `${Math.round(lo * 10) / 10}–${Math.round(hi * 10) / 10}%` };
        }
      });
    });
  });

  // 6c: AUTO-CORRECTION — if >2 materials still above 5% in heart+base,
  // progressively reduce the weakest-persistence ones to support role
  const heavyItems: { fam: string; layer: string; idx: number; upper: number; persistence: number; name: string }[] = [];
  Object.entries(formula).forEach(([fam, layers]) => {
    ['heart', 'base'].forEach(layer => {
      const items = layers[layer as 'heart' | 'base'];
      items.forEach((item, idx) => {
        const upper = getUpperPct(item);
        if (upper > 5) {
          const orig = [...(INGREDIENT_DB[fam]?.heart ?? []), ...(INGREDIENT_DB[fam]?.base ?? [])].find(i => i.name === item.name);
          heavyItems.push({ fam, layer, idx, upper, persistence: orig?.persistence ?? 5, name: item.name });
        }
      });
    });
  });

  if (heavyItems.length > 2) {
    // Sort: hero untouched, then lowest persistence first (weakest gets reduced)
    heavyItems.sort((a, b) => {
      if (a.name === heroName) return -1;
      if (b.name === heroName) return 1;
      return a.persistence - b.persistence;
    });

    let reductions = 0;
    for (const h of heavyItems) {
      if (h.name === heroName) continue;
      if (heavyItems.length - reductions <= 2) break;

      const items = formula[h.fam][h.layer as 'heart' | 'base'];
      const item = items[h.idx];
      const lo = getLowerPct(item);
      const hi = getUpperPct(item);
      const newLo = Math.round(lo * 0.7 * 10) / 10;
      const newHi = Math.round(hi * 0.7 * 10) / 10;
      items[h.idx] = { ...item, percent: `${newLo}–${newHi}%` };
      perfumerNotes.push(`${item.name} reduced to support role (${newLo}–${newHi}%) — yields headroom to hero`);
      reductions++;
    }
  }

  // ─── STEP 7: FUNCTIONAL DUPLICATE DETECTION ──────────
  const functionalGroups: Record<string, string[]> = {
    'white-musk': ['White Musk (Galaxolide)', 'Musk Accord (white)', 'Musk Ketone', 'Musk (Ethylene Brassylate)'],
    'ambergris': ['Ambroxan', 'Ambergris Accord (Ambroxan + Labdanum)'],
    'sandalwood': ['Sandalwood (Australian)', 'Mysore Sandalwood Accord'],
    'vetiver': ['Vetiver EO (Java)', 'Vetiver EO (Haiti)', 'Vetiver EO'],
    'cedar': ['Cedarwood Atlas EO', 'Cedarwood Virginia'],
    'labdanum-amber': ['Labdanum Absolute', 'Amber Accord (in-house blend)'],
    'pepper': ['Pink Pepper CO2', 'Pink Pepper EO', 'Black Pepper CO2'],
    'hedione': ['Hedione', 'Hedione HC'],
    'bergamot': ['Bergamot EO', 'Bergamot EO (Italian)', 'Bergamot EO (Calabrian type)'],
  };

  const usedGroups = new Map<string, string[]>();
  Object.values(formula).forEach(layers => {
    ['top', 'heart', 'base'].forEach(layer => {
      (layers[layer as 'top' | 'heart' | 'base'] ?? []).forEach(item => {
        for (const [group, members] of Object.entries(functionalGroups)) {
          if (members.includes(item.name)) {
            if (!usedGroups.has(group)) usedGroups.set(group, []);
            usedGroups.get(group)!.push(item.name);
          }
        }
      });
    });
  });

  usedGroups.forEach((members, group) => {
    if (members.length > 1) {
      perfumerNotes.push(`Functional overlap: ${members.join(' + ')} (both serve ${group} role). Consider replacing one for complexity.`);
      const weakerName = members[1];
      Object.values(formula).forEach(layers => {
        ['heart', 'base'].forEach(layer => {
          const items = layers[layer as 'heart' | 'base'];
          items.forEach((item, idx) => {
            if (item.name === weakerName) {
              const lo = getLowerPct(item);
              const hi = getUpperPct(item);
              items[idx] = { ...item, percent: `${Math.round(lo * 0.6 * 10) / 10}–${Math.round(hi * 0.6 * 10) / 10}%` };
            }
          });
        });
      });
    }
  });

  // ─── FINAL OUTPUT ─────────────────────────
  const steeping = estimateSteeping(picked, concentration);
  _lastMeta = { steeping, ingredientCount: picked.length, ifraWarnings, perfumerNotes };
  return { formula, steeping, ingredientCount: picked.length, ifraWarnings, perfumerNotes };
}

/* ==========================================================
   PUBLIC API
   ========================================================== */

export async function generateSmartFormula(opts: {
  dominant: string; secondary: string; accent: string; scentCode: string;
  concentration?: string; occasion?: string; intensity?: string;
}): Promise<FormulaResult> {
  // Future: Claude API mode
  return generateLocalFormula(opts.dominant, opts.secondary, opts.accent, opts.scentCode, opts.concentration, opts.occasion, opts.intensity);
}

export function getFormulaMetadata() { return _lastMeta; }
export const AI_MODE = USE_CLAUDE_API && CLAUDE_API_KEY ? 'claude-api' : 'local-smart';