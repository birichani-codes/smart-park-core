const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { findOne, insert } = require('../utils/db');
const { generateId } = require('../utils/generateId');
const { success, error } = require('../utils/response');
const { JWT_SECRET } = require('../middleware/auth');
const { sendEmail } = require('../utils/email');

// POST /api/auth/register
async function register(req, res) {
  try {
    const { fullName, email, password, phone, vehicleReg } = req.body;

    if (findOne('users', 'email', email)) {
      return error(res, 'Email already registered', 409);
    }

    const hashed = await bcrypt.hash(password, 12);
    const user = insert('users', {
      id: generateId('u'),
      fullName,
      email,
      password: hashed,
      phone,
      vehicleReg: vehicleReg || '',
      role: 'driver',
      createdAt: new Date().toISOString(),
    });

    try {
      await sendEmail({
        to: email,
        subject: 'Welcome to SmartPark',
        text: `Welcome to SmartPark, ${fullName}! Your account has been created successfully.`,
        html: `<p>Hi ${fullName},</p><p>Welcome to <strong>SmartPark</strong>. Your account is ready and you can now reserve parking slots, get QR access, and manage your trips.</p><p>Thanks,<br />SmartPark Team</p>`,
      });
    } catch (sendError) {
      console.error('Welcome email failed:', sendError.message || sendError);
    }

    const { password: _, ...safe } = user;
    return success(res, { user: safe }, 'Registration successful', 201);
  } catch (err) {
    return error(res, err.message);
  }
}

// POST /api/auth/login
async function login(req, res) {
  try {
    const { email, password } = req.body;

    const user = findOne('users', 'email', email);
    if (!user) return error(res, 'Invalid email or password', 401);

    const match = await bcrypt.compare(password, user.password);
    if (!match) return error(res, 'Invalid email or password', 401);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, fullName: user.fullName },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const { password: _, ...safe } = user;
    return success(res, { token, user: safe }, 'Login successful');
  } catch (err) {
    return error(res, err.message);
  }
}

// GET /api/auth/me
function me(req, res) {
  const user = findOne('users', 'id', req.user.id);
  if (!user) return error(res, 'User not found', 404);
  const { password: _, ...safe } = user;
  return success(res, { user: safe });
}

module.exports = { register, login, me };
