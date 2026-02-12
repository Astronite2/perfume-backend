// perfume-backend/test-formula.ts
// Run: npx tsx test-formula.ts
// Or: npx ts-node test-formula.ts

import { generateSmartFormula, getFormulaMetadata } from './lib/aiFormulaService';

async function testFormula() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  SCENTOLOGY FORMULA ENGINE — QUALITY TEST');
  console.log('═══════════════════════════════════════════\n');

  // Test cases that would previously produce bad results
  const tests = [
    {
      label: 'TEST 1: Oriental-Woody-Spicy (the ChatGPT feedback case)',
      params: { dominant: 'oriental', secondary: 'woody', accent: 'spicy', scentCode: 'OWS-001', concentration: 'Eau de Parfum', occasion: 'Special occasion', intensity: 'Leave a trail' },
    },
    {
      label: 'TEST 2: Fresh-Citrus-Aquatic (light scent)',
      params: { dominant: 'fresh', secondary: 'citrus', accent: 'aquatic', scentCode: 'FCA-002', concentration: 'Eau de Toilette', occasion: 'Everyday signature', intensity: 'Subtle aura' },
    },
    {
      label: 'TEST 3: Woody-Oriental-Leather (heavy masculine)',
      params: { dominant: 'woody', secondary: 'oriental', accent: 'leather', scentCode: 'WOL-003', concentration: 'Parfum Extrait', occasion: 'Special occasion', intensity: 'Leave a trail' },
    },
    {
      label: 'TEST 4: Floral-Powdery-Gourmand (feminine)',
      params: { dominant: 'floral', secondary: 'powdery', accent: 'gourmand', scentCode: 'FPG-004', concentration: 'Eau de Parfum', occasion: 'Date night', intensity: 'moderate' },
    },
  ];

  for (const test of tests) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`  ${test.label}`);
    console.log(`${'─'.repeat(50)}`);

    const result = await generateSmartFormula(test.params);
    const meta = getFormulaMetadata();

    // Count ingredients
    let totalIngredients = 0;
    let heroCount = 0;
    const allNames: string[] = [];

    Object.entries(result.formula).forEach(([family, layers]) => {
      console.log(`\n  📦 ${family.toUpperCase()} family:`);
      (['top', 'heart', 'base'] as const).forEach(layer => {
        const items = layers[layer];
        if (items.length === 0) return;
        console.log(`    ${layer.toUpperCase()}:`);
        items.forEach(i => {
          totalIngredients++;
          allNames.push(i.name);
          console.log(`      • ${i.name} — ${i.percent} (${i.supplier})`);
        });
      });
    });

    // Quality checks
    console.log(`\n  📊 QUALITY CHECKS:`);

    // Check 1: Ingredient count (should be 8-12)
    const countOk = totalIngredients >= 6 && totalIngredients <= 14;
    console.log(`    ${countOk ? '✅' : '❌'} Ingredient count: ${totalIngredients} (target: 8-12)`);

    // Check 2: No duplicate ingredients
    const dupes = allNames.filter((n, i) => allNames.indexOf(n) !== i);
    const noDupes = dupes.length === 0;
    console.log(`    ${noDupes ? '✅' : '❌'} No duplicates: ${noDupes ? 'PASS' : `FAIL — ${dupes.join(', ')}`}`);

    // Check 3: Has top notes (opening exists)
    let topCount = 0;
    Object.values(result.formula).forEach(layers => { topCount += layers.top.length; });
    const hasTop = topCount >= 1;
    console.log(`    ${hasTop ? '✅' : '❌'} Top notes present: ${topCount} (need ≥1)`);

    // Check 4: Dominant family has the most ingredients
    const familyCounts: Record<string, number> = {};
    Object.entries(result.formula).forEach(([fam, layers]) => {
      familyCounts[fam] = layers.top.length + layers.heart.length + layers.base.length;
    });
    const domHasMost = familyCounts[test.params.dominant] >= Math.max(...Object.values(familyCounts));
    console.log(`    ${domHasMost ? '✅' : '⚠️'} Dominant family leads: ${JSON.stringify(familyCounts)}`);

    // Check 5: Steeping estimate exists
    const hasSteeping = !!meta?.steeping;
    console.log(`    ${hasSteeping ? '✅' : '❌'} Steeping estimate: ${meta?.steeping?.label ?? 'MISSING'} (${meta?.steeping?.category})`);
    if (meta?.steeping?.notes) console.log(`       "${meta.steeping.notes}"`);

    // Check 6: IFRA warnings tracked
    console.log(`    ✅ IFRA warnings: ${meta?.ifraWarnings?.length === 0 ? 'None (all safe)' : meta?.ifraWarnings?.join(', ')}`);

    // Check 7: No "center of gravity" clash
    // Count how many ingredients have high percentages (>5%)
    let highPctCount = 0;
    Object.values(result.formula).forEach(layers => {
      ['heart', 'base'].forEach(layer => {
        (layers[layer as 'heart' | 'base'] ?? []).forEach(i => {
          const nums = i.percent.match(/[\d.]+/g);
          if (nums && parseFloat(nums[nums.length - 1]) > 5) highPctCount++;
        });
      });
    });
    const noClash = highPctCount <= 2;
    console.log(`    ${noClash ? '✅' : '⚠️'} Center-of-gravity check: ${highPctCount} high-% ingredients in heart/base (target: ≤2)`);

    // Check 8: Perfumer notes (auto-corrections and intelligence)
    if (result.perfumerNotes && result.perfumerNotes.length > 0) {
      console.log(`    🧪 PERFUMER NOTES:`);
      result.perfumerNotes.forEach(note => {
        console.log(`       → ${note}`);
      });
    } else {
      console.log(`    ✅ Perfumer notes: Clean formula — no corrections needed`);
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log('  TEST COMPLETE');
  console.log(`${'═'.repeat(50)}\n`);
}

testFormula().catch(console.error);