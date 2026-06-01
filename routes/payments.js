const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

router.post('/initiate',
  authenticate,
  [body('amount').isNumeric(), body('phone').notEmpty()],
  validate, ctrl.initiatePayment
);
router.get('/my',    authenticate, ctrl.getMyPayments);
router.get('/:id',   authenticate, ctrl.getPayment);

module.exports = router;
