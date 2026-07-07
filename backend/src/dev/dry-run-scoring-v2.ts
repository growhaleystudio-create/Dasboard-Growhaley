import { writeFile } from 'node:fs/promises';

import { BasicHtmlWebsiteAuditor } from '../audit/custom-website-auditor.js';
import { getPool, loadEnv } from '../index.js';
import { LeadRepository } from '../repository/lead-repository.js';
import { buildDryRunReport, dryRunToCsv, type AuditResolver } from '../scoring/v2/dry-run.js';
import { fromCustomAudit } from '../scoring/v2/map-lead-input.js';
import { isBusinessWebsiteUrl } from '../url/business-website.js';

const PAGE_SIZE = 500;

/**
 * Read-only dry-run of the v2 scoring engine over one team's leads.
 *
 *   node dist/dev/dry-run-scoring-v2.js <teamId> [--audit] [--out=path.csv]
 *
 * `--audit` runs a live custom-parser audit per business-website lead (slower,
 * makes outbound requests). Without it, websites are scored as "unaudited".
 * Nothing is written back to the database.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const teamId = args.find((a) => !a.startsWith('--'));
  if (!teamId) {
    throw new Error('Usage: node dist/dev/dry-run-scoring-v2.js <teamId> [--audit] [--out=path.csv]');
  }
  const withAudit = args.includes('--audit');
  const outArg = args.find((a) => a.startsWith('--out='));
  const outPath = outArg ? outArg.slice('--out='.length) : `scoring-v2-dryrun-${teamId}.csv`;

  loadEnv();
  const pool = getPool();
  const leads = new LeadRepository(pool);

  const all = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await leads.listForTeam(teamId, {
      includeDuplicates: false,
      limit: PAGE_SIZE,
      offset,
    });
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  let resolveAudit: AuditResolver | undefined;
  if (withAudit) {
    const auditor = new BasicHtmlWebsiteAuditor();
    resolveAudit = async (lead) => {
      if (!lead.profileUrl || !isBusinessWebsiteUrl(lead.profileUrl)) return undefined;
      try {
        return fromCustomAudit(await auditor.audit(lead.profileUrl));
      } catch {
        return undefined;
      }
    };
  }

  const report = await buildDryRunReport(all, resolveAudit);
  await writeFile(outPath, dryRunToCsv(report), 'utf8');

  console.log(
    JSON.stringify(
      {
        teamId,
        withAudit,
        outPath,
        count: report.count,
        bandHistogram: report.bandHistogram,
        comparison: report.comparison,
      },
      null,
      2,
    ),
  );

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
