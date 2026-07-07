exports.up = (pgm) => {
  pgm.createTable('lead_website_audit', {
    lead_id: {
      type: 'uuid',
      primaryKey: true,
      references: 'lead(id)',
      onDelete: 'cascade',
    },
    team_id: {
      type: 'uuid',
      notNull: true,
      references: 'team(id)',
      onDelete: 'cascade',
    },
    audit_source: {
      type: 'text',
      notNull: true,
      check: "audit_source IN ('lighthouse', 'custom-parser')",
    },
    status: {
      type: 'text',
      notNull: true,
      check:
        "status IN ('ok', 'parked', 'inactive', 'timeout', 'fetch_failed', 'unknown')",
    },
    performance_score: {
      type: 'smallint',
      notNull: false,
      check: 'performance_score BETWEEN 0 AND 100',
    },
    seo_score: {
      type: 'smallint',
      notNull: false,
      check: 'seo_score BETWEEN 0 AND 100',
    },
    accessibility_score: {
      type: 'smallint',
      notNull: false,
      check: 'accessibility_score BETWEEN 0 AND 100',
    },
    best_practices_score: {
      type: 'smallint',
      notNull: false,
      check: 'best_practices_score BETWEEN 0 AND 100',
    },
    // { hasContactChannel, hasCta, hasContactForm }
    conversion: {
      type: 'jsonb',
      notNull: true,
    },
    // { seo: {...}, ux: {...} } custom-parser fallback signals; null for Lighthouse.
    fallback: {
      type: 'jsonb',
      notNull: false,
    },
    // Core Web Vitals for AI insight (not scoring): { lcpMs, tbtMs, cls, inpMs, fcpMs, speedIndexMs }
    core_web_vitals: {
      type: 'jsonb',
      notNull: false,
    },
    computed_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('lead_website_audit', ['team_id']);
  pgm.createIndex('lead_website_audit', ['computed_at']);
};

exports.down = (pgm) => {
  pgm.dropIndex('lead_website_audit', ['computed_at']);
  pgm.dropIndex('lead_website_audit', ['team_id']);
  pgm.dropTable('lead_website_audit');
};
