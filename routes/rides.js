const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/rideController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

router.post('/',
  authenticate,
  [
    body('destination').notEmpty(),
    body('departureTime').isISO8601(),
    body('totalSeats').isInt({ min: 1 }),
    body('totalCost').isNumeric(),
  ],
  validate, ctrl.offerRide
);
router.get('/',         authenticate, ctrl.getRides);
router.get('/match',    authenticate, ctrl.matchRides);
router.get('/my',       authenticate, ctrl.getMyRides);
router.post('/:id/join', authenticate, ctrl.joinRide);

module.exports = router;
