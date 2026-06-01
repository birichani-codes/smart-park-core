const { v4: uuidv4 } = require('uuid');

/**
 * Generate a short prefixed ID, e.g. "u_a1b2c3d4"
 */
function generateId(prefix = '') {
  const short = uuidv4().replace(/-/g, '').slice(0, 8);
  return prefix ? `${prefix}_${short}` : short;
}

module.exports = { generateId };
