exports.up = (pgm) => {
  pgm.addColumns('lead', {
    whatsapp_verification_status: {
      type: 'text',
      notNull: true,
      default: 'unchecked',
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('lead', ['whatsapp_verification_status']);
};
