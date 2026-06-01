const { readData, findAll, updateById } = require('../utils/db');
const { success, error } = require('../utils/response');

// GET /api/parking/slots  (optionally ?zone=A&floor=1)
function getSlots(req, res) {
  try {
    const { zone, floor } = req.query;
    const filter = {};
    if (zone)  filter.zone  = zone.toUpperCase();
    if (floor) filter.floor = parseInt(floor);

    const slots = findAll('parking_slots', filter);
    const total     = slots.length;
    const available = slots.filter(s => s.status === 'available').length;
    const occupied  = slots.filter(s => s.status === 'occupied').length;
    const reserved  = slots.filter(s => s.status === 'reserved').length;

    return success(res, { slots, stats: { total, available, occupied, reserved } });
  } catch (err) {
    return error(res, err.message);
  }
}

// GET /api/parking/slots/:id
function getSlot(req, res) {
  try {
    const slots = readData('parking_slots');
    const slot = slots.find(s => s.id === req.params.id);
    if (!slot) return error(res, 'Slot not found', 404);
    return success(res, { slot });
  } catch (err) {
    return error(res, err.message);
  }
}

// PATCH /api/parking/slots/:id/status  (attendant/admin only)
function updateSlotStatus(req, res) {
  try {
    const { status } = req.body;
    const validStatuses = ['available', 'occupied', 'reserved', 'maintenance'];
    if (!validStatuses.includes(status)) {
      return error(res, `Status must be one of: ${validStatuses.join(', ')}`, 400);
    }
    const updated = updateById('parking_slots', req.params.id, { status });
    if (!updated) return error(res, 'Slot not found', 404);
    return success(res, { slot: updated }, 'Slot status updated');
  } catch (err) {
    return error(res, err.message);
  }
}

module.exports = { getSlots, getSlot, updateSlotStatus };
