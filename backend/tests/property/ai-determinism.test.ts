import { describe, it } from 'vitest';
import fc from 'fast-check';
import { computeScore } from '../../src/scoring/compute-score.js';
import type { ScorableLead } from '../../src/scoring/scorable-lead.js';
import type { ScoringFactor } from '@leads-generator/shared';

describe('aiIntentScore property', () => {
  it('Feature: leads-generator-dashboard, Property 37: ai_intent_match factor determinism', () => {
    // Generate an aiIntentScore (0-100) or null
    const scoreArb = fc.option(fc.integer({ min: 0, max: 100 }), { nil: null });
    
    // Generate a matching weight
    const weightArb = fc.float({ min: Math.fround(0.1), max: Math.fround(10), noNaN: true });

    fc.assert(
      fc.property(scoreArb, weightArb, (aiIntentScore, weight) => {
        const lead: ScorableLead = {
          id: 'test',
          matchedKeywords: [],
          sources: [],
          discoveredAt: new Date('2026-06-01T00:00:00Z'),
          referenceTime: new Date('2026-06-01T00:00:00Z'),
          aiIntentScore, // Include the AI score
        };

        const factors: ScoringFactor[] = [
          {
            id: 'ai-factor',
            kind: 'ai_intent_match',
            weight,
            params: {},
          }
        ];

        const result1 = computeScore(lead, factors);
        const result2 = computeScore(lead, factors);

        // Determinism check
        if (result1.score !== result2.score) return false;
        
        // Unscored rule (R13.13): if aiIntentScore is null, factor contributes 0
        if (aiIntentScore === null) {
          if (result1.contributions[0]?.rawValue !== 0) return false;
        } else {
          // Normalised to 0-1
          const expectedRaw = aiIntentScore / 100;
          if (Math.abs(result1.contributions[0]!.rawValue - expectedRaw) > 0.001) return false;
        }

        return true;
      })
    );
  });
});
