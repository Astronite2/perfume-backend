// lib/formulaStore.ts
// ═══════════════════════════════════════════════════════════
// FORMULA SAVING & VERSIONING
// In-memory store with Supabase-ready interface
// Swap the storage adapter when you connect Supabase
// ═══════════════════════════════════════════════════════════

import type { FormulaResult } from './aiFormulaService';
import type { ScentCard } from './scentCardService';
import type { BatchSheet } from './batchService';

/* ==========================================================
   TYPES
   ========================================================== */

export interface FormulaVersion {
  id: string;
  scentCode: string;
  version: number;
  formula: FormulaResult;
  scentCard: ScentCard;
  batchSheet: BatchSheet;
  input: {
    dominant: string;
    secondary: string;
    accent: string;
    concentration?: string;
    occasion?: string;
    intensity?: string;
  };
  status: 'draft' | 'approved' | 'in-production' | 'archived';
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface FormulaRecord {
  scentCode: string;
  scentName?: string;
  customerName?: string;
  customerEmail?: string;
  versions: FormulaVersion[];
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

/* ==========================================================
   STORAGE INTERFACE (swap for Supabase later)
   ========================================================== */

interface StorageAdapter {
  save(record: FormulaRecord): Promise<void>;
  get(scentCode: string): Promise<FormulaRecord | null>;
  list(limit?: number, offset?: number): Promise<FormulaRecord[]>;
  delete(scentCode: string): Promise<boolean>;
}

/* ==========================================================
   IN-MEMORY ADAPTER (development)
   ========================================================== */

class InMemoryAdapter implements StorageAdapter {
  private store = new Map<string, FormulaRecord>();

  async save(record: FormulaRecord): Promise<void> {
    this.store.set(record.scentCode, record);
  }

  async get(scentCode: string): Promise<FormulaRecord | null> {
    return this.store.get(scentCode) ?? null;
  }

  async list(limit = 50, offset = 0): Promise<FormulaRecord[]> {
    const all = Array.from(this.store.values())
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return all.slice(offset, offset + limit);
  }

  async delete(scentCode: string): Promise<boolean> {
    return this.store.delete(scentCode);
  }
}

/* ==========================================================
   SUPABASE ADAPTER (ready to implement)
   ========================================================== */

// Uncomment and fill in when you connect Supabase:
//
// import { createClient } from '@supabase/supabase-js';
//
// class SupabaseAdapter implements StorageAdapter {
//   private client = createClient(
//     process.env.SUPABASE_URL!,
//     process.env.SUPABASE_SERVICE_KEY!
//   );
//
//   async save(record: FormulaRecord): Promise<void> {
//     await this.client.from('formulas').upsert({
//       scent_code: record.scentCode,
//       data: record,
//       updated_at: new Date().toISOString(),
//     });
//   }
//
//   async get(scentCode: string): Promise<FormulaRecord | null> {
//     const { data } = await this.client
//       .from('formulas')
//       .select('data')
//       .eq('scent_code', scentCode)
//       .single();
//     return data?.data ?? null;
//   }
//
//   async list(limit = 50, offset = 0): Promise<FormulaRecord[]> {
//     const { data } = await this.client
//       .from('formulas')
//       .select('data')
//       .order('updated_at', { ascending: false })
//       .range(offset, offset + limit - 1);
//     return (data ?? []).map(row => row.data);
//   }
//
//   async delete(scentCode: string): Promise<boolean> {
//     const { error } = await this.client
//       .from('formulas')
//       .delete()
//       .eq('scent_code', scentCode);
//     return !error;
//   }
// }

/* ==========================================================
   FORMULA STORE (public API)
   ========================================================== */

// Switch adapter here when ready:
// const adapter: StorageAdapter = new SupabaseAdapter();
const adapter: StorageAdapter = new InMemoryAdapter();

export async function saveFormula(opts: {
  scentCode: string;
  scentName?: string;
  customerName?: string;
  customerEmail?: string;
  formula: FormulaResult;
  scentCard: ScentCard;
  batchSheet: BatchSheet;
  input: FormulaVersion['input'];
  notes?: string;
}): Promise<FormulaVersion> {
  const now = new Date().toISOString();
  const existing = await adapter.get(opts.scentCode);

  const version = existing ? existing.currentVersion + 1 : 1;

  const formulaVersion: FormulaVersion = {
    id: `${opts.scentCode}-v${version}`,
    scentCode: opts.scentCode,
    version,
    formula: opts.formula,
    scentCard: opts.scentCard,
    batchSheet: opts.batchSheet,
    input: opts.input,
    status: 'draft',
    notes: opts.notes ?? '',
    createdAt: now,
    updatedAt: now,
  };

  const record: FormulaRecord = existing
    ? {
        ...existing,
        scentName: opts.scentName ?? existing.scentName,
        customerName: opts.customerName ?? existing.customerName,
        customerEmail: opts.customerEmail ?? existing.customerEmail,
        versions: [...existing.versions, formulaVersion],
        currentVersion: version,
        updatedAt: now,
      }
    : {
        scentCode: opts.scentCode,
        scentName: opts.scentName,
        customerName: opts.customerName,
        customerEmail: opts.customerEmail,
        versions: [formulaVersion],
        currentVersion: 1,
        createdAt: now,
        updatedAt: now,
      };

  await adapter.save(record);
  return formulaVersion;
}

export async function getFormula(scentCode: string): Promise<FormulaRecord | null> {
  return adapter.get(scentCode);
}

export async function getFormulaVersion(scentCode: string, version?: number): Promise<FormulaVersion | null> {
  const record = await adapter.get(scentCode);
  if (!record) return null;
  if (version) {
    return record.versions.find(v => v.version === version) ?? null;
  }
  return record.versions[record.versions.length - 1] ?? null;
}

export async function updateFormulaStatus(
  scentCode: string,
  version: number,
  status: FormulaVersion['status']
): Promise<boolean> {
  const record = await adapter.get(scentCode);
  if (!record) return false;
  const v = record.versions.find(v => v.version === version);
  if (!v) return false;
  v.status = status;
  v.updatedAt = new Date().toISOString();
  record.updatedAt = v.updatedAt;
  await adapter.save(record);
  return true;
}

export async function listFormulas(limit?: number, offset?: number): Promise<FormulaRecord[]> {
  return adapter.list(limit, offset);
}

export async function deleteFormula(scentCode: string): Promise<boolean> {
  return adapter.delete(scentCode);
}
