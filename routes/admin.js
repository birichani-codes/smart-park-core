const router = require('express').Router();
const ctrl = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/stats',                    authenticate, authorize('admin'), ctrl.getStats);
router.get('/users',                    authenticate, authorize('admin'), ctrl.getUsers);
router.patch('/users/:id/role',         authenticate, authorize('admin'), ctrl.updateUserRole);
router.get('/reservations',             authenticate, authorize('admin', 'attendant'), ctrl.getAllReservations);
router.get('/notifications/:userId',    authenticate, authorize('admin'), ctrl.getUserNotifications);

module.exports = router;
