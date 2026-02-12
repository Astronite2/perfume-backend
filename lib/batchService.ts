// lib/batchService.ts
// ═══════════════════════════════════════════════════════════
// BATCH SCALING & PRODUCTION NOTES
// Converts formula percentages into gram weights for production
// ═══════════════════════════════════════════════════════════

import type { FormulaResult } from './aiFormulaService';

/* ==========================================================
   TYPES
   ========================================================== */

export interface BatchLine {
  name: string;
  family: string;
  layer: 'top' | 'heart' | 'base';
  percentLow: number;
  percentHigh: number;
  gramsLow: number;
  gramsHigh: number;
  supplier: string;
}

export interface BatchSheet {
  scentCode: string;
  concentration: string;
  batchSizeMl: number;
  alcoholGrams: number;
  totalOilPercent: { low: number; high: number };
  lines: BatchLine[];
  productionNotes: string[];
  mixingOrder: string[];
  qualityChecks: string[];
  version: number;
  createdAt: string;
}

/* ==========================================================
   CONCENTRATION → OIL/ALCOHOL RATIO
   ========================================================== */

const CONCENTRATION_RATIO: Record<string, { oilPercent: number; alcoholPercent: number; diluent: string }> = {
  'Eau de Cologne':   { oilPercent: 5,  alcoholPercent: 90, diluent: '5% distilled water' },
  'Eau de Toilette':  { oilPercent: 10, alcoholPercent: 85, diluent: '5% distilled water' },
  'Eau de Parfum':    { oilPercent: 18, alcoholPercent: 78, diluent: '4% distilled water' },
  'Parfum Extrait':   { oilPercent: 25, alcoholPercent: 72, diluent: '3% distilled water' },
};

/* ==========================================================
   BATCH SIZE PRESETS (ml)
   ========================================================== */

export const BATCH_SIZES = {
  sample:    10,   // Discovery vial
  travel:    30,   // Travel spray
  standard:  50,   // Standard bottle
  full:      100,  // Full size
  workshop:  500,  // Workshop batch (multiple bottles)
} as const;

/* ==========================================================
   GENERATE BATCH SHEET
   ========================================================== */

export function generateBatchSheet(opts: {
  formula: FormulaResult;
  scentCode: string;
  concentration: string;
  batchSizeMl: number;
  version?: number;
}): BatchSheet {
  const { formula, scentCode, concentration, batchSizeMl, version = 1 } = opts;
  const concRatio = CONCENTRATION_RATIO[concentration] ?? CONCENTRATION_RATIO['Eau de Parfum'];

  // Alcohol density ~0.79 g/ml, perfume oil ~0.95 g/ml average
  const ALCOHOL_DENSITY = 0.79;
  const OIL_DENSITY = 0.95;

  const totalVolumeMl = batchSizeMl;
  const oilVolumeMl = totalVolumeMl * (concRatio.oilPercent / 100);
  const alcoholVolumeMl = totalVolumeMl * (concRatio.alcoholPercent / 100);
  const alcoholGrams = Math.round(alcoholVolumeMl * ALCOHOL_DENSITY * 100) / 100;
  const oilTotalGrams = oilVolumeMl * OIL_DENSITY;

  // Parse formula into batch lines
  const lines: BatchLine[] = [];
  let totalPctLow = 0;
  let totalPctHigh = 0;

  Object.entries(formula.formula).forEach(([family, layers]) => {
    (['top', 'heart', 'base'] as const).forEach(layer => {
      const items = layers[layer];
      if (!items) return;
      items.forEach(item => {
        const nums = item.percent.match(/[\d.]+/g);
        if (!nums || nums.length < 2) return;

        const pctLow = parseFloat(nums[0]);
        const pctHigh = parseFloat(nums[1]);
        totalPctLow += pctLow;
        totalPctHigh += pctHigh;

        // Convert percentage of oil to grams
        const gramsLow = Math.round((pctLow / 100) * oilTotalGrams * 100) / 100;
        const gramsHigh = Math.round((pctHigh / 100) * oilTotalGrams * 100) / 100;

        lines.push({
          name: item.name,
          family,
          layer,
          percentLow: pctLow,
          percentHigh: pctHigh,
          gramsLow,
          gramsHigh,
          supplier: item.supplier,
        });
      });
    });
  });

  // Sort: base → heart → top (mixing order)
  const layerOrder = { base: 0, heart: 1, top: 2 };
  lines.sort((a, b) => layerOrder[a.layer] - layerOrder[b.layer]);

  // Production notes
  const productionNotes: string[] = [
    `Batch size: ${batchSizeMl}ml ${concentration}`,
    `Oil concentration: ${concRatio.oilPercent}% (${Math.round(oilTotalGrams * 10) / 10}g oil in ${Math.round(alcoholGrams)}g alcohol)`,
    `Diluent: ${concRatio.diluent}`,
    `Total formula oil range: ${Math.round(totalPctLow * 10) / 10}–${Math.round(totalPctHigh * 10) / 10}%`,
  ];

  // Add steeping note
  if (formula.steeping) {
    productionNotes.push(`Steeping: ${formula.steeping.label} — ${formula.steeping.notes}`);
  }

  // Add IFRA warnings
  if (formula.ifraWarnings.length > 0) {
    productionNotes.push(`⚠️ IFRA alerts: ${formula.ifraWarnings.join('; ')}`);
  }

  // Add perfumer notes
  if (formula.perfumerNotes && formula.perfumerNotes.length > 0) {
    formula.perfumerNotes.forEach(note => {
      productionNotes.push(`🧪 ${note}`);
    });
  }

  // Mixing order instructions
  const mixingOrder = [
    '1. Weigh base notes into clean beaker — these are the foundation',
    '2. Add heart notes one at a time, swirling gently between additions',
    '3. Add top notes last — these are volatile and should not be over-mixed',
    `4. Let the concentrate rest for 24 hours before adding alcohol`,
    `5. Add ${Math.round(alcoholGrams)}g perfumer's alcohol (≥96% ethanol)`,
    '6. Shake vigorously for 60 seconds, then rest',
    `7. Cold-filter if cloudy. Steep for ${formula.steeping?.label ?? '1-2 weeks'} before evaluation`,
    '8. Adjust with alcohol if projection feels too heavy',
  ];

  // Quality checks
  const qualityChecks = [
    'Visual clarity — should be transparent with no sediment',
    `Scent check at 48 hours — verify opening is balanced (not too sharp)`,
    `Scent check at ${formula.steeping?.minDays ?? 7} days — heart should be cohesive`,
    `Final evaluation at ${formula.steeping?.maxDays ?? 14} days — base should be smooth`,
    'Skin test — 2 sprays on inner wrist, evaluate at 15min, 1hr, 4hr marks',
    'Sillage check — ask someone to stand 1 meter away and confirm projection',
  ];

  return {
    scentCode,
    concentration,
    batchSizeMl,
    alcoholGrams,
    totalOilPercent: { low: Math.round(totalPctLow * 10) / 10, high: Math.round(totalPctHigh * 10) / 10 },
    lines,
    productionNotes,
    mixingOrder,
    qualityChecks,
    version,
    createdAt: new Date().toISOString(),
  };
}

/* ==========================================================
   SCALE TO DIFFERENT SIZE
   ========================================================== */

export function scaleBatch(sheet: BatchSheet, newSizeMl: number): BatchSheet {
  const ratio = newSizeMl / sheet.batchSizeMl;
  return {
    ...sheet,
    batchSizeMl: newSizeMl,
    alcoholGrams: Math.round(sheet.alcoholGrams * ratio * 100) / 100,
    lines: sheet.lines.map(line => ({
      ...line,
      gramsLow: Math.round(line.gramsLow * ratio * 100) / 100,
      gramsHigh: Math.round(line.gramsHigh * ratio * 100) / 100,
    })),
    productionNotes: sheet.productionNotes.map(note =>
      note.startsWith('Batch size:') ? `Batch size: ${newSizeMl}ml ${sheet.concentration} (scaled from ${sheet.batchSizeMl}ml)` : note
    ),
  };
}
