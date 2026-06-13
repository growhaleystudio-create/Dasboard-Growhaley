/**
 * ExampleRetriever — retrieves the most relevant approved examples for a
 * given RetrievalQuery using a simple, explainable relevance score.
 *
 * Design references:
 * - design.md → Components and Interfaces → ApprovedExampleService & ExampleRetriever
 *
 * Relevance formula (no embeddings, fully explainable):
 *   score = W_TAG    * jaccard(example.tags,  query.tags)
 *         + W_ASPECT * (example.aspectRatio === query.aspectRatio ? 1 : 0)
 *         + W_BLOCK  * jaccard(flatBlockSet(example), query.intendedBlocks)
 *
 * Where:
 *   jaccard(A, B) = |A ∩ B| / |A ∪ B|  (returns 0 when both sets are empty)
 *   flatBlockSet(example) = union of all BlockType values across all slides
 *
 * Only examples with score >= THRESHOLD are returned.
 * Returns [] when the library is empty or no example meets the threshold.
 *
 * Requirements: 8.2, 8.4, 8.7
 */

import type { ApprovedExampleStructure, AspectRatio, BlockType } from '@leads-generator/shared';

import type { ApprovedExampleRepository } from '../repository/approved-example-repository.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RetrievalQuery {
  aspectRatio: AspectRatio;
  tags: string[];
  intendedBlocks: BlockType[];
}

export interface ExampleRetriever {
  /**
   * Returns the top-N (default 3) most relevant ApprovedExampleStructures
   * for a team whose score >= THRESHOLD.
   *
   * Returns [] when:
   * - the library is empty (R8.4)
   * - no example meets the relevance threshold (R8.7)
   */
  topRelevant(
    teamId: string,
    query: RetrievalQuery,
    n?: number,
  ): Promise<ApprovedExampleStructure[]>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Jaccard similarity between two arrays treated as sets.
 * Returns 0 when both arrays are empty (to avoid 0/0).
 */
function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 0;

  const setA = new Set(a);
  const setB = new Set(b);

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Returns the union of all BlockType values across every slide in an example.
 */
function flatBlockSet(example: ApprovedExampleStructure): BlockType[] {
  const seen = new Set<BlockType>();
  for (const slide of example.slides) {
    for (const block of slide.blocks) {
      seen.add(block);
    }
  }
  return [...seen];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class DefaultExampleRetriever implements ExampleRetriever {
  private static readonly W_TAG = 0.4;
  private static readonly W_ASPECT = 0.3;
  private static readonly W_BLOCK = 0.3;
  private static readonly THRESHOLD = 0.1;

  constructor(private readonly repo: ApprovedExampleRepository) {}

  async topRelevant(
    teamId: string,
    query: RetrievalQuery,
    n = 3,
  ): Promise<ApprovedExampleStructure[]> {
    // 1. Fetch all examples for the team
    const examples = await this.repo.listForTeam(teamId);

    // 2. Empty library → return []  (R8.4)
    if (examples.length === 0) return [];

    // 3. Score each example
    const scored = examples.map((ex) => {
      const structure = ex.layoutStructure;

      const tagScore = jaccard(structure.tags, query.tags);
      const aspectScore = structure.aspectRatio === query.aspectRatio ? 1 : 0;
      const blockScore = jaccard(flatBlockSet(structure), query.intendedBlocks);

      const score =
        DefaultExampleRetriever.W_TAG * tagScore +
        DefaultExampleRetriever.W_ASPECT * aspectScore +
        DefaultExampleRetriever.W_BLOCK * blockScore;

      return { structure, score };
    });

    // 4. Filter by threshold  (R8.7)
    const relevant = scored.filter((s) => s.score >= DefaultExampleRetriever.THRESHOLD);

    // 5. No example meets threshold → return []
    if (relevant.length === 0) return [];

    // 6. Sort descending by score
    relevant.sort((a, b) => b.score - a.score);

    // 7. Return top-N structures
    return relevant.slice(0, n).map((s) => s.structure);
  }
}
