import { getPool, loadEnv } from '../index.js';
import { BasicHtmlWebsiteAuditor } from '../audit/custom-website-auditor.js';
import { LeadRepository } from '../repository/lead-repository.js';
import { LeadOpportunityScorer } from '../scoring/service/lead-opportunity-scorer.js';
import { backfillLeadScoringBreakdowns } from '../scoring/backfill-lead-scoring-breakdowns.js';

async function main() {
  const [, , teamId] = process.argv;
  if (!teamId) {
    throw new Error('Usage: node dist/dev/backfill-lead-scoring-breakdowns.js <teamId>');
  }

  loadEnv();
  const dbPool = getPool();
  const leads = new LeadRepository(dbPool);
  const scorer = new LeadOpportunityScorer({
    pool: dbPool,
    leadReads: leads,
    auditor: new BasicHtmlWebsiteAuditor(),
  });

  const report = await backfillLeadScoringBreakdowns(
    {
      leads,
      scorer,
    },
    teamId,
  );

  console.log(JSON.stringify({ teamId, report }));
  await dbPool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
