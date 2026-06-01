const jwt = require('jsonwebtoken');
const { error } = require('../utils/response');

const JWT_SECRET = process.env.JWT_SECRET || 'smartpark_secret_key_2025';

/**
 * Verify JWT and attach user payload to req.user
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return error(res, 'No token provided', 401);
  }
  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return error(res, 'Invalid or expired token', 401);
  }
}

/**
 * Restrict access to specific roles.
 * Usage: authorize('admin') or authorize('admin', 'attendant')
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return error(res, 'Access denied: insufficient permissions', 403);
    }
    next();
  };
}

module.exports = { authenticate, authorize, JWT_SECRET };
