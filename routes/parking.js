const router = require('express').Router();
const { getSlots, getSlot, updateSlotStatus } = require('../controllers/parkingController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/slots',         authenticate, getSlots);
router.get('/slots/:id',     authenticate, getSlot);
router.patch('/slots/:id/status', authenticate, authorize('admin', 'attendant'), updateSlotStatus);

module.exports = router;
