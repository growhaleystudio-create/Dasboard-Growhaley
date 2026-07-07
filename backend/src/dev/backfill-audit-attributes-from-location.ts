import { writeFile } from 'node:fs/promises';

import { getPool, loadEnv } from '../index.js';
import { LeadRepository } from '../repository/lead-repository.js';
import { mergeLocationAttributes } from '../scoring/v2/parse-location-attributes.js';

const PAGE_SIZE = 500;

interface Proposal {
  leadId: string;
  name: string;
  location: string;
  rating: number | undefined;
  reviewCount: number | undefined;
  category: string | undefined;
}

/**
 * Rescue rating/reviews/category from the `location` string into
 * `auditAttributes` so the scorer can finally see them.
 *
 *   node dist/dev/backfill-audit-attributes-from-location.js <teamId> [--apply] [--out=path.csv]
 *
 * Default is PREVIEW: it prints and writes the proposed changes but does NOT
 * touch the database. Pass `--apply` to actually persist them.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const teamId = args.find((a) => !a.startsWith('--'));
  if (!teamId) {
    throw new Error(
      'Usage: node dist/dev/backfill-audit-attributes-from-location.js <teamId> [--apply] [--out=path.csv]',
    );
  }
  const apply = args.includes('--apply');
  const outArg = args.find((a) => a.startsWith('--out='));
  const outPath = outArg ? outArg.slice('--out='.length) : `backfill-attributes-${teamId}.csv`;

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

  const proposals: Proposal[] = [];
  for (const lead of all) {
    const merged = mergeLocationAttributes(lead.location, lead.auditAttributes);
    if (!merged) continue;
    proposals.push({
      leadId: lead.id,
      name: lead.name ?? '',
      location: lead.location ?? '',
      rating: merged.rating,
      reviewCount: merged.reviewCount,
      category: merged.category,
    });
  }

  const csv = [
    'lead_id,name,location,rating,review_count,category',
    ...proposals.map((p) =>
      [p.leadId, p.name, p.location, p.rating ?? '', p.reviewCount ?? '', p.category ?? '']
        .map((v) => {
          const text = String(v);
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(','),
    ),
  ].join('\n');
  await writeFile(outPath, csv, 'utf8');

  let applied = 0;
  if (apply) {
    for (const lead of all) {
      const merged = mergeLocationAttributes(lead.location, lead.auditAttributes);
      if (!merged) continue;
      await leads.setAuditAttributes(teamId, lead.id, merged);
      applied += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        teamId,
        mode: apply ? 'APPLIED' : 'PREVIEW (no DB writes)',
        totalLeads: all.length,
        proposedChanges: proposals.length,
        applied,
        outPath,
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
