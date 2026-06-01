const { readData, findAll, updateById, deleteById } = require('../utils/db');
const { success, error } = require('../utils/response');

// GET /api/admin/stats
function getStats(req, res) {
  try {
    const slots        = readData('parking_slots');
    const reservations = readData('reservations');
    const payments     = readData('payments');
    const users        = readData('users');
    const rides        = readData('rides');

    const totalRevenue = payments
      .filter(p => p.status === 'completed')
      .reduce((sum, p) => sum + p.amount, 0);

    return success(res, {
      slots: {
        total:     slots.length,
        available: slots.filter(s => s.status === 'available').length,
        occupied:  slots.filter(s => s.status === 'occupied').length,
        reserved:  slots.filter(s => s.status === 'reserved').length,
      },
      reservations: {
        total:     reservations.length,
        confirmed: reservations.filter(r => r.status === 'confirmed').length,
        completed: reservations.filter(r => r.status === 'completed').length,
        cancelled: reservations.filter(r => r.status === 'cancelled').length,
      },
      payments: {
        total:       payments.length,
        totalRevenue,
      },
      users: {
        total:      users.length,
        drivers:    users.filter(u => u.role === 'driver').length,
        attendants: users.filter(u => u.role === 'attendant').length,
        admins:     users.filter(u => u.role === 'admin').length,
      },
      rides: {
        total: rides.length,
        open:  rides.filter(r => r.status === 'open').length,
      },
    });
  } catch (err) {
    return error(res, err.message);
  }
}

// GET /api/admin/users
function getUsers(req, res) {
  try {
    const users = readData('users').map(({ password: _, ...u }) => u);
    return success(res, { users });
  } catch (err) {
    return error(res, err.message);
  }
}

// PATCH /api/admin/users/:id/role
function updateUserRole(req, res) {
  try {
    const { role } = req.body;
    const validRoles = ['driver', 'attendant', 'admin'];
    if (!validRoles.includes(role)) return error(res, 'Invalid role', 400);
    const updated = updateById('users', req.params.id, { role });
    if (!updated) return error(res, 'User not found', 404);
    const { password: _, ...safe } = updated;
    return success(res, { user: safe }, 'Role updated');
  } catch (err) {
    return error(res, err.message);
  }
}

// GET /api/admin/reservations
function getAllReservations(req, res) {
  try {
    const reservations = readData('reservations');
    return success(res, { reservations });
  } catch (err) {
    return error(res, err.message);
  }
}

// GET /api/admin/notifications/:userId
function getUserNotifications(req, res) {
  try {
    const userId = req.params.userId || req.user.id;
    const notes = findAll('notifications', { userId });
    return success(res, { notifications: notes });
  } catch (err) {
    return error(res, err.message);
  }
}

module.exports = { getStats, getUsers, updateUserRole, getAllReservations, getUserNotifications };
