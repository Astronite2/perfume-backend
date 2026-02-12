// lib/scentExperienceService.ts

export function buildScentExperience(opts: {
  dominant: string;
  secondary: string;
  accent: string;
  intensity?: string;
  occasion?: string;
}) {
  const projection =
    opts.intensity === 'Leave a trail'
      ? 'Strong projection with noticeable sillage'
      : opts.intensity === 'Subtle aura'
      ? 'Soft, close-to-skin aura'
      : 'Balanced projection';

  const evolution =
    opts.occasion === 'Special occasion'
      ? 'Opens confidently, deepens with warmth and character over time'
      : 'Smooth opening with a controlled, wearable evolution';

  return {
    character: `${opts.dominant} structure with ${opts.accent} nuances`,
    projection,
    evolution,
    craftNote:
      'Composed using a structured perfumery system focused on balance, wearability, and material hierarchy.',
  };
}