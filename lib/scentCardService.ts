// lib/scentCardService.ts
// ═══════════════════════════════════════════════════════════
// CUSTOMER-FACING SCENT CARD GENERATOR
// Produces the text customers see — story, wear guide, naming
// ═══════════════════════════════════════════════════════════

import type { FormulaResult } from './aiFormulaService';

/* ==========================================================
   TYPES
   ========================================================== */

export interface ScentCard {
  headline: string;          // e.g. "A Warm Oriental with Woody Depth"
  story: string;             // 2-3 sentence scent narrative
  scentJourney: {
    opening: string;         // What you smell first (0-15 min)
    heart: string;           // The main character (15 min - 2hr)
    drydown: string;         // What lingers (2hr+)
  };
  howToWear: {
    occasions: string[];     // Best occasions
    seasons: string[];       // Best seasons
    timeOfDay: string;       // Day, evening, or both
    applicationTip: string;  // Where/how to apply
    longevityNote: string;   // How long to expect
  };
  perfumerSignature: string; // Short craft note
}

/* ==========================================================
   FAMILY DESCRIPTORS
   ========================================================== */

const FAMILY_VOCAB: Record<string, {
  adjective: string;
  texture: string;
  openingNote: string;
  heartNote: string;
  baseNote: string;
  season: string[];
  mood: string;
}> = {
  floral:    { adjective: 'floral', texture: 'silky', openingNote: 'a burst of fresh petals', heartNote: 'lush blooming florals', baseNote: 'soft musky warmth', season: ['spring', 'summer'], mood: 'romantic and graceful' },
  woody:     { adjective: 'woody', texture: 'velvety', openingNote: 'crisp aromatic freshness', heartNote: 'rich textured woods', baseNote: 'deep creamy sandalwood', season: ['autumn', 'winter'], mood: 'confident and grounded' },
  oriental:  { adjective: 'oriental', texture: 'opulent', openingNote: 'warm spiced brightness', heartNote: 'rich resinous depth', baseNote: 'lingering amber warmth', season: ['autumn', 'winter'], mood: 'mysterious and magnetic' },
  fresh:     { adjective: 'fresh', texture: 'airy', openingNote: 'sparkling citrus and green notes', heartNote: 'clean transparent florals', baseNote: 'light musky skin scent', season: ['spring', 'summer'], mood: 'effortless and uplifting' },
  citrus:    { adjective: 'citrus', texture: 'bright', openingNote: 'zesty citrus burst', heartNote: 'aromatic herbal crispness', baseNote: 'soft woody undertone', season: ['spring', 'summer'], mood: 'energizing and joyful' },
  gourmand:  { adjective: 'gourmand', texture: 'enveloping', openingNote: 'sweet spiced warmth', heartNote: 'rich cocoa and tonka', baseNote: 'deep vanilla comfort', season: ['autumn', 'winter'], mood: 'indulgent and cozy' },
  aromatic:  { adjective: 'aromatic', texture: 'herbal', openingNote: 'fresh lavender and herbs', heartNote: 'sage and aromatic greens', baseNote: 'earthy vetiver base', season: ['spring', 'autumn'], mood: 'refined and composed' },
  smoky:     { adjective: 'smoky', texture: 'raw', openingNote: 'sharp pepper and spark', heartNote: 'smoldering wood and tar', baseNote: 'campfire embers fading', season: ['autumn', 'winter'], mood: 'bold and untamed' },
  spicy:     { adjective: 'spicy', texture: 'radiant', openingNote: 'warm cardamom and pepper', heartNote: 'saffron-laced richness', baseNote: 'amber and resinous glow', season: ['autumn', 'winter'], mood: 'seductive and daring' },
  powdery:   { adjective: 'powdery', texture: 'soft', openingNote: 'gentle aldehydic shimmer', heartNote: 'iris and heliotrope haze', baseNote: 'cashmere musk embrace', season: ['spring', 'year-round'], mood: 'elegant and nostalgic' },
  green:     { adjective: 'green', texture: 'crisp', openingNote: 'crushed leaves and stems', heartNote: 'dewy fig and tea', baseNote: 'mossy earth finish', season: ['spring', 'summer'], mood: 'natural and invigorating' },
  aquatic:   { adjective: 'aquatic', texture: 'cool', openingNote: 'ocean breeze and salt', heartNote: 'marine accord and ozone', baseNote: 'driftwood and ambergris', season: ['summer'], mood: 'free-spirited and clean' },
  leather:   { adjective: 'leather', texture: 'structured', openingNote: 'sharp birch and juniper', heartNote: 'supple suede warmth', baseNote: 'dark castoreum and smoke', season: ['autumn', 'winter'], mood: 'powerful and distinguished' },
  clean:     { adjective: 'clean', texture: 'transparent', openingNote: 'crisp aldehydic sparkle', heartNote: 'white floral clarity', baseNote: 'skin-close musk glow', season: ['year-round'], mood: 'pure and modern' },
  incense:   { adjective: 'incense', texture: 'sacred', openingNote: 'bright resinous lift', heartNote: 'frankincense and myrrh smoke', baseNote: 'deep benzoin meditation', season: ['autumn', 'winter'], mood: 'spiritual and contemplative' },
  niche:     { adjective: 'avant-garde', texture: 'complex', openingNote: 'unexpected green accord', heartNote: 'layered abstract textures', baseNote: 'ambergris and innovation', season: ['year-round'], mood: 'artistic and individual' },
};

/* ==========================================================
   CONCENTRATION DATA
   ========================================================== */

const CONCENTRATION_WEAR: Record<string, {
  longevityHours: string;
  applicationTip: string;
  reapply: string;
}> = {
  'Eau de Cologne':   { longevityHours: '2-3 hours', applicationTip: 'Spray generously on pulse points and clothing. Ideal for refreshing throughout the day.', reapply: 'Reapply every 2-3 hours for continuous presence.' },
  'Eau de Toilette':  { longevityHours: '4-6 hours', applicationTip: 'Apply to pulse points — wrists, neck, behind ears. A light spray on clothing extends the trail.', reapply: 'One midday refresh keeps the scent alive into evening.' },
  'Eau de Parfum':    { longevityHours: '6-10 hours', applicationTip: 'Two sprays on pulse points is all you need. The warmth of your skin will do the rest.', reapply: 'Lasts from morning to evening without reapplication.' },
  'Parfum Extrait':   { longevityHours: '10-14+ hours', applicationTip: 'Dab sparingly on inner wrists and behind ears. This concentration is potent — less is more.', reapply: 'A single application carries through a full day and into the night.' },
};

/* ==========================================================
   OCCASION & INTENSITY MAPPING
   ========================================================== */

const OCCASION_TEXT: Record<string, string[]> = {
  'Everyday signature':   ['Daily wear', 'Office', 'Casual outings'],
  'Special occasion':     ['Evening events', 'Date night', 'Celebrations'],
  'Date night':           ['Intimate evenings', 'Dinner dates', 'Romantic occasions'],
  'Work / professional':  ['Business meetings', 'Office', 'Networking events'],
  'Night out':            ['Clubs', 'Parties', 'Late evenings'],
  'Outdoor / active':     ['Weekends', 'Outdoor activities', 'Travel'],
};

const INTENSITY_TIME: Record<string, string> = {
  'Subtle aura':    'Day — a quiet personal signature',
  'Moderate':       'Day to evening — versatile and balanced',
  'Leave a trail':  'Evening — designed to make an entrance',
};

/* ==========================================================
   GENERATE SCENT CARD
   ========================================================== */

export function generateScentCard(opts: {
  dominant: string;
  secondary: string;
  accent: string;
  concentration?: string;
  occasion?: string;
  intensity?: string;
  scentName?: string;
  formula?: FormulaResult;
}): ScentCard {
  const dom = FAMILY_VOCAB[opts.dominant] ?? FAMILY_VOCAB.woody;
  const sec = FAMILY_VOCAB[opts.secondary] ?? FAMILY_VOCAB.floral;
  const acc = FAMILY_VOCAB[opts.accent] ?? FAMILY_VOCAB.fresh;

  const conc = opts.concentration ?? 'Eau de Parfum';
  const concWear = CONCENTRATION_WEAR[conc] ?? CONCENTRATION_WEAR['Eau de Parfum'];
  const occasion = opts.occasion ?? 'Everyday signature';
  const intensity = opts.intensity ?? 'Moderate';

  // --- Headline ---
  const headlineAdj = capitalize(dom.texture);
  const headline = `${aAn(headlineAdj)} ${headlineAdj} ${capitalize(dom.adjective)} with ${capitalize(sec.adjective)} Depth`;

  // --- Story ---
  const story = `This is ${aAn(dom.mood)} ${dom.mood} fragrance built on ${dom.adjective} foundations, enriched with ${sec.adjective} complexity and touched by ${acc.adjective} intrigue. Crafted as ${conc}, it unfolds in waves — from ${aAn(dom.texture)} ${dom.texture} opening to a lasting signature that is unmistakably yours.`;

  // --- Scent Journey ---
  const scentJourney = {
    opening: `${dom.openingNote}, brightened by ${acc.adjective} accents — the first impression that draws people in.`,
    heart: `The fragrance settles into ${dom.heartNote}, woven with ${sec.heartNote} — this is the true character of your scent.`,
    drydown: `Hours later, ${dom.baseNote} emerges, blending with ${sec.baseNote} for a lasting, intimate finish.`,
  };

  // --- How to Wear ---
  const seasons = [...new Set([...dom.season, ...sec.season])];
  const occasions = OCCASION_TEXT[occasion] ?? ['Any occasion'];
  const timeOfDay = INTENSITY_TIME[intensity] ?? INTENSITY_TIME['Moderate'];

  const howToWear = {
    occasions,
    seasons,
    timeOfDay,
    applicationTip: concWear.applicationTip,
    longevityNote: `Expect ${concWear.longevityHours} of wear. ${concWear.reapply}`,
  };

  // --- Perfumer Signature ---
  const perfumerNoteCount = opts.formula?.perfumerNotes?.length ?? 0;
  const ingredientCount = opts.formula?.ingredientCount ?? 8;
  const steepingLabel = opts.formula?.steeping?.label ?? '1-2 weeks';

  const perfumerSignature = `Composed from ${ingredientCount} carefully selected materials. Allow ${steepingLabel} for full maturation. Each bottle is individually batched and quality-checked.`;

  return {
    headline,
    story,
    scentJourney,
    howToWear,
    perfumerSignature,
  };
}

/* ==========================================================
   HELPERS
   ========================================================== */

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function aAn(word: string): string {
  return /^[aeiou]/i.test(word) ? 'An' : 'A';
}