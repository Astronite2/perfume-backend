// lib/scentWorkflow.ts
// ═══════════════════════════════════════════════════════════
// SCENT CREATION WORKFLOW
// Orchestrates: formula → scent card → batch sheet → save
// ═══════════════════════════════════════════════════════════

import { generateSmartFormula, getFormulaMetadata } from '@/lib/aiFormulaService';
import type { SteepingInfo, FormulaResult } from '@/lib/aiFormulaService';
import { buildScentExperience } from '@/lib/scentExperienceService';
import { generateScentCard } from '@/lib/scentCardService';
import type { ScentCard } from '@/lib/scentCardService';
import { generateBatchSheet, BATCH_SIZES } from '@/lib/batchService';
import type { BatchSheet } from '@/lib/batchService';
import { saveFormula } from '@/lib/formulaStore';
import type { FormulaVersion } from '@/lib/formulaStore';

/* ==========================================================
   TYPES
   ========================================================== */

export interface CustomScentResult {
  formula: Record<string, any>;
  experience: {
    character: string;
    projection: string;
    evolution: string;
    craftNote: string;
  };
  scentCard: ScentCard;
  batchSheet: BatchSheet;
  meta: {
    steeping: SteepingInfo;
    ingredientCount: number;
    ifraWarnings: string[];
    perfumerNotes: string[];
  } | null;
  savedVersion: FormulaVersion | null;
}

/* ==========================================================
   MAIN WORKFLOW
   ========================================================== */

export async function createCustomScent(opts: {
  dominant: string;
  secondary: string;
  accent: string;
  scentCode: string;
  scentName?: string;
  customerName?: string;
  customerEmail?: string;
  deliveryTier?: 'express' | 'signature' | 'atelier';
  concentration?: string;
  occasion?: string;
  intensity?: string;
  batchSizeMl?: number;
  save?: boolean;
}): Promise<CustomScentResult> {
  const {
    deliveryTier = 'signature',
    batchSizeMl = BATCH_SIZES.standard,
    save = true,
    ...rest
  } = opts;

  // ─── 1. Generate formula ────────────────
  const formulaResult = await generateSmartFormula({
    dominant: opts.dominant,
    secondary: opts.secondary,
    accent: opts.accent,
    scentCode: opts.scentCode,
    concentration: opts.concentration,
    occasion: opts.occasion,
    intensity: opts.intensity,
  });

  // ─── 2. Build experience text ───────────
  const experience = buildScentExperience({
    dominant: opts.dominant,
    secondary: opts.secondary,
    accent: opts.accent,
    intensity: opts.intensity,
    occasion: opts.occasion,
  });

  // ─── 3. Generate scent card ─────────────
  const scentCard = generateScentCard({
    dominant: opts.dominant,
    secondary: opts.secondary,
    accent: opts.accent,
    concentration: opts.concentration,
    occasion: opts.occasion,
    intensity: opts.intensity,
    scentName: opts.scentName,
    formula: formulaResult,
  });

  // ─── 4. Generate batch sheet ────────────
  const batchSheet = generateBatchSheet({
    formula: formulaResult,
    scentCode: opts.scentCode,
    concentration: opts.concentration ?? 'Eau de Parfum',
    batchSizeMl,
  });

  // ─── 5. Get metadata ───────────────────
  const meta = getFormulaMetadata();

  // ─── 6. Save formula version ────────────
  let savedVersion: FormulaVersion | null = null;
  if (save) {
    try {
      savedVersion = await saveFormula({
        scentCode: opts.scentCode,
        scentName: opts.scentName,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        formula: formulaResult,
        scentCard,
        batchSheet,
        input: {
          dominant: opts.dominant,
          secondary: opts.secondary,
          accent: opts.accent,
          concentration: opts.concentration,
          occasion: opts.occasion,
          intensity: opts.intensity,
        },
      });
    } catch (e) {
      console.error('Failed to save formula version:', e);
    }
  }

  return {
    formula: formulaResult.formula,
    experience,
    scentCard,
    batchSheet,
    meta,
    savedVersion,
  };
}
