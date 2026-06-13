/**
 * Migration: 1700000009000_expand-content-template-types
 * Purpose: Allow platform-specific content template types.
 */

exports.shorthands = undefined;

const expandedTypes = [
  'instagram',
  'email_marketing',
  'threads',
  'linkedin',
  'facebook',
  'twitter_x',
  'social_post',
  'email_banner',
  'carousel',
  'story',
  'other',
];

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE content_template
      DROP CONSTRAINT IF EXISTS content_template_type_check;

    ALTER TABLE content_template
      ADD CONSTRAINT content_template_type_check
      CHECK (type IN (${expandedTypes.map((type) => `'${type}'`).join(', ')}));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE content_template
      DROP CONSTRAINT IF EXISTS content_template_type_check;

    ALTER TABLE content_template
      ADD CONSTRAINT content_template_type_check
      CHECK (type IN ('social_post', 'email_banner', 'carousel', 'story', 'other'));
  `);
};
