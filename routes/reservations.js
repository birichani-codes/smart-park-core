const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/reservationController');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

router.post('/',
  authenticate,
  [body('slotId').notEmpty(), body('arrivalTime').isISO8601()],
  validate, ctrl.createReservation
);
router.get('/my',         authenticate, ctrl.getMyReservations);
router.get('/:id',        authenticate, ctrl.getReservation);
router.post('/:id/confirm', authenticate, ctrl.confirmReservation);
router.post('/scan',      authenticate, authorize('attendant', 'admin'), ctrl.scanQR);
router.post('/:id/extend', authenticate, [ body('phone').optional().isMobilePhone('en-KE') ], validate, ctrl.extendReservation);
router.post('/lpr/scan',   [ body('plate').notEmpty() ], validate, ctrl.handleLprScan);
router.delete('/:id',     authenticate, ctrl.cancelReservation);

module.exports = router;
