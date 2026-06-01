const { validationResult } = require('express-validator');
const { error } = require('../utils/response');

/**
 * Run after express-validator chains — returns 400 if any errors exist.
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return error(res, 'Validation failed', 400, errors.array());
  }
  next();
}

module.exports = { validate };
