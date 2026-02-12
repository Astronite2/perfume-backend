// perfume-backend/app/api/scent/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createCustomScent } from '@/lib/scentWorkflow';
import { getFormula, listFormulas } from '@/lib/formulaStore';
import { scaleBatch, BATCH_SIZES } from '@/lib/batchService';

// ─── POST: Create a new scent ───────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      dominant, secondary, accent, scentCode,
      scentName, customerName, customerEmail,
      concentration, occasion, intensity,
      deliveryTier, batchSizeMl, save,
    } = body;

    if (!dominant || !secondary || !accent || !scentCode) {
      return NextResponse.json(
        { error: 'Missing required fields: dominant, secondary, accent, scentCode' },
        { status: 400 }
      );
    }

    const result = await createCustomScent({
      dominant, secondary, accent, scentCode,
      scentName, customerName, customerEmail,
      concentration, occasion, intensity,
      deliveryTier, batchSizeMl, save,
    });

    return NextResponse.json({
      success: true,
      formula: result.formula,
      experience: result.experience,
      scentCard: result.scentCard,
      batchSheet: result.batchSheet,
      meta: result.meta,
      version: result.savedVersion ? {
        id: result.savedVersion.id,
        version: result.savedVersion.version,
        status: result.savedVersion.status,
      } : null,
    });
  } catch (error: any) {
    console.error('Scent API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate formula', detail: error?.message },
      { status: 500 }
    );
  }
}

// ─── GET: Retrieve a saved formula ───────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const scentCode = searchParams.get('scentCode');

    // List all formulas
    if (!scentCode) {
      const formulas = await listFormulas(50);
      return NextResponse.json({
        success: true,
        formulas: formulas.map(f => ({
          scentCode: f.scentCode,
          scentName: f.scentName,
          customerName: f.customerName,
          currentVersion: f.currentVersion,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt,
        })),
      });
    }

    // Get specific formula
    const record = await getFormula(scentCode);
    if (!record) {
      return NextResponse.json({ error: 'Formula not found' }, { status: 404 });
    }

    // Optional: rescale batch sheet
    const batchSize = searchParams.get('batchSize');
    const latestVersion = record.versions[record.versions.length - 1];
    let batchSheet = latestVersion.batchSheet;

    if (batchSize && parseInt(batchSize) !== batchSheet.batchSizeMl) {
      batchSheet = scaleBatch(batchSheet, parseInt(batchSize));
    }

    return NextResponse.json({
      success: true,
      record: {
        scentCode: record.scentCode,
        scentName: record.scentName,
        customerName: record.customerName,
        currentVersion: record.currentVersion,
        versions: record.versions.map(v => ({
          id: v.id,
          version: v.version,
          status: v.status,
          createdAt: v.createdAt,
        })),
      },
      latest: {
        formula: latestVersion.formula.formula,
        scentCard: latestVersion.scentCard,
        batchSheet,
        meta: {
          steeping: latestVersion.formula.steeping,
          ingredientCount: latestVersion.formula.ingredientCount,
          ifraWarnings: latestVersion.formula.ifraWarnings,
          perfumerNotes: latestVersion.formula.perfumerNotes,
        },
      },
    });
  } catch (error: any) {
    console.error('Scent GET error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve formula', detail: error?.message },
      { status: 500 }
    );
  }
}
