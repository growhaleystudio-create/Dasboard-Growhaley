exports.up = (pgm) => {
  pgm.addColumns('lead', {
    audit_attributes: { type: 'jsonb', notNull: false },
  });

  pgm.createTable('lead_scoring_breakdown', {
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
    scoring_version: {
      type: 'text',
      notNull: true,
    },
    has_website: {
      type: 'boolean',
      notNull: true,
    },
    business_value_score: {
      type: 'smallint',
      notNull: true,
      check: 'business_value_score BETWEEN 0 AND 100',
    },
    website_need_score: {
      type: 'smallint',
      notNull: true,
      check: 'website_need_score BETWEEN 0 AND 100',
    },
    reachability_score: {
      type: 'smallint',
      notNull: true,
      check: 'reachability_score BETWEEN 0 AND 100',
    },
    confidence_score: {
      type: 'smallint',
      notNull: true,
      check: 'confidence_score BETWEEN 0 AND 100',
    },
    confidence_modifier: {
      type: 'numeric(4,2)',
      notNull: true,
      check: 'confidence_modifier >= 0.00 AND confidence_modifier <= 1.00',
    },
    base_score: {
      type: 'smallint',
      notNull: true,
      check: 'base_score BETWEEN 0 AND 100',
    },
    final_score: {
      type: 'smallint',
      notNull: true,
      check: 'final_score BETWEEN 0 AND 100',
    },
    audit_source: {
      type: 'text',
      notNull: false,
      check: "audit_source IN ('custom-parser')",
    },
    computed_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('lead_scoring_breakdown', ['team_id']);
};

exports.down = (pgm) => {
  pgm.dropIndex('lead_scoring_breakdown', ['team_id']);
  pgm.dropTable('lead_scoring_breakdown');
  pgm.dropColumns('lead', ['audit_attributes']);
};
