exports.up = (pgm) => {
  pgm.addColumns('lead', {
    whatsapp_url: { type: 'text', notNull: false },
    whatsapp_number: { type: 'text', notNull: false },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('lead', ['whatsapp_url', 'whatsapp_number']);
};
