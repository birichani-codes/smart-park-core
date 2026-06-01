const QRCode = require('qrcode');
const { readData, findAll, findOne, insert, updateById } = require('../utils/db');
const { generateId } = require('../utils/generateId');
const { success, error } = require('../utils/response');

const BASE_PARKING_PRICE = 200;

function getDynamicReservationPrice() {
  const slots = readData('parking_slots');
  const total = slots.length || 1;
  const occupied = slots.filter(s => s.status === 'occupied').length;
  const multiplier = 1 + occupied / total;
  return Math.ceil(BASE_PARKING_PRICE * multiplier);
}

function getDefaultExpiry(arrivalTime) {
  return new Date(new Date(arrivalTime).getTime() + 60 * 60 * 1000).toISOString();
}

function findUserByPlate(plate) {
  if (!plate) return null;
  const users = readData('users');
  return users.find(u => u.vehicleReg && u.vehicleReg.toLowerCase() === plate.toLowerCase());
}

function simulateMpesaPush(phone, amount) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        mpesaCode: 'QGH' + Math.random().toString(36).substring(2, 9).toUpperCase(),
        phone,
        amount,
      });
    }, 800);
  });
}

// POST /api/reservations  — create a reservation (requires prior payment simulation)
async function createReservation(req, res) {
  try {
    const { slotId, arrivalTime } = req.body;
    const userId = req.user.id;

    // Check slot availability
    const slot = findOne('parking_slots', 'id', slotId);
    if (!slot) return error(res, 'Slot not found', 404);
    if (slot.status !== 'available') return error(res, 'Slot is not available', 409);

    const reservationId = generateId('r');
    const now = new Date().toISOString();
    const price = getDynamicReservationPrice();
    const expiresAt = getDefaultExpiry(arrivalTime);

    // Create reservation
    const reservation = insert('reservations', {
      id: reservationId,
      userId,
      slotId,
      slotNumber: slot.slotNumber,
      zone: slot.zone,
      arrivalTime,
      expiresAt,
      price,
      status: 'pending_payment',
      paymentId: null,
      qrCodeId: null,
      entryTime: null,
      exitTime: null,
      createdAt: now,
    });

    // Mark slot as reserved
    updateById('parking_slots', slotId, {
      status: 'reserved',
      reservedBy: userId,
      reservedUntil: expiresAt,
    });

    return success(res, { reservation }, 'Reservation created — awaiting payment', 201);
  } catch (err) {
    return error(res, err.message);
  }
}

// GET /api/reservations  — list current user's reservations
function getMyReservations(req, res) {
  try {
    const reservations = findAll('reservations', { userId: req.user.id });
    return success(res, { reservations });
  } catch (err) {
    return error(res, err.message);
  }
}

// GET /api/reservations/:id
function getReservation(req, res) {
  try {
    const reservation = findOne('reservations', 'id', req.params.id);
    if (!reservation) return error(res, 'Reservation not found', 404);
    if (reservation.userId !== req.user.id && !['admin', 'attendant'].includes(req.user.role)) {
      return error(res, 'Access denied', 403);
    }
    return success(res, { reservation });
  } catch (err) {
    return error(res, err.message);
  }
}

// POST /api/reservations/:id/confirm  — called after payment succeeds; generates QR
async function confirmReservation(req, res) {
  try {
    const reservation = findOne('reservations', 'id', req.params.id);
    if (!reservation) return error(res, 'Reservation not found', 404);
    if (reservation.userId !== req.user.id) return error(res, 'Access denied', 403);
    if (reservation.status === 'confirmed') return error(res, 'Already confirmed', 409);

    const qrToken = `QR-${reservation.id}-${req.user.id}-${Date.now()}`;

    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(qrToken, { width: 300, margin: 2 });

    const qrRecord = insert('qr_codes', {
      id: generateId('q'),
      reservationId: reservation.id,
      userId: req.user.id,
      token: qrToken,
      qrDataUrl,
      used: false,
      createdAt: new Date().toISOString(),
    });

    const expiresAt = reservation.expiresAt || getDefaultExpiry(reservation.arrivalTime);

    const updated = updateById('reservations', reservation.id, {
      status: 'confirmed',
      qrCodeId: qrRecord.id,
      expiresAt,
    });

    // Add notification
    insert('notifications', {
      id: generateId('n'),
      userId: req.user.id,
      type: 'reservation_confirmed',
      message: `Your reservation for slot ${reservation.slotNumber} (Zone ${reservation.zone}) has been confirmed.`,
      read: false,
      createdAt: new Date().toISOString(),
    });

    return success(res, { reservation: updated, qrCode: qrRecord }, 'Reservation confirmed');
  } catch (err) {
    return error(res, err.message);
  }
}

// POST /api/reservations/:id/extend  — extend a confirmed reservation by 1 hour
async function extendReservation(req, res) {
  try {
    const reservation = findOne('reservations', 'id', req.params.id);
    if (!reservation) return error(res, 'Reservation not found', 404);
    if (reservation.userId !== req.user.id && req.user.role !== 'admin') {
      return error(res, 'Access denied', 403);
    }
    if (reservation.status !== 'confirmed') return error(res, 'Only confirmed reservations may be extended', 400);

    const currentExpiry = reservation.expiresAt
      ? new Date(reservation.expiresAt)
      : new Date(getDefaultExpiry(reservation.arrivalTime));
    const newExpiry = new Date(currentExpiry.getTime() + 60 * 60 * 1000).toISOString();
    const extensionAmount = reservation.price || getDynamicReservationPrice();
    const phone = req.body.phone || req.user.phone;

    const mpesaResult = await simulateMpesaPush(phone, extensionAmount);
    if (!mpesaResult.success) return error(res, 'Payment failed. Please try again.', 402);

    const payment = insert('payments', {
      id: generateId('p'),
      userId: req.user.id,
      reservationId: reservation.id,
      rideId: null,
      amount: extensionAmount,
      phone: mpesaResult.phone,
      method: 'mpesa',
      status: 'completed',
      mpesaCode: mpesaResult.mpesaCode,
      createdAt: new Date().toISOString(),
    });

    updateById('reservations', reservation.id, {
      expiresAt: newExpiry,
      paymentId: payment.id,
    });

    updateById('parking_slots', reservation.slotId, {
      reservedUntil: newExpiry,
    });

    insert('notifications', {
      id: generateId('n'),
      userId: req.user.id,
      type: 'reservation_extended',
      message: `Your reservation for ${reservation.slotNumber} has been extended by 1 hour.`,
      read: false,
      reservationId: reservation.id,
      createdAt: new Date().toISOString(),
    });

    const updated = findOne('reservations', 'id', reservation.id);
    return success(res, { reservation: updated, payment }, 'Reservation extended by 1 hour');
  } catch (err) {
    return error(res, err.message);
  }
}

// POST /api/reservations/lpr/scan  — camera gateway posts license plates for automatic entry/exit
async function handleLprScan(req, res) {
  try {
    const { plate } = req.body;
    if (!plate) return error(res, 'License plate is required', 400);

    const user = findUserByPlate(plate);
    if (!user) return error(res, 'No vehicle registered with this plate', 404);

    const activeReservations = readData('reservations')
      .filter(r => r.userId === user.id && r.status === 'confirmed')
      .sort((a, b) => new Date(a.arrivalTime) - new Date(b.arrivalTime));

    if (!activeReservations.length) return error(res, 'No active confirmed reservation found for this vehicle', 404);

    const reservation = activeReservations[0];
    const now = new Date().toISOString();

    if (!reservation.entryTime) {
      updateById('reservations', reservation.id, { entryTime: now });
      updateById('parking_slots', reservation.slotId, { status: 'occupied' });
      insert('notifications', {
        id: generateId('n'),
        userId: user.id,
        type: 'parking_entry',
        message: `Vehicle ${plate} granted entry for slot ${reservation.slotNumber}.`,
        read: false,
        reservationId: reservation.id,
        createdAt: now,
      });
      return success(res, { action: 'entry', reservationId: reservation.id, slot: reservation.slotNumber }, 'Entry granted');
    }

    if (!reservation.exitTime) {
      updateById('reservations', reservation.id, { exitTime: now, status: 'completed' });
      updateById('parking_slots', reservation.slotId, {
        status: 'available', reservedBy: null, reservedUntil: null,
      });
      insert('notifications', {
        id: generateId('n'),
        userId: user.id,
        type: 'parking_exit',
        message: `Vehicle ${plate} exited from slot ${reservation.slotNumber}.`,
        read: false,
        reservationId: reservation.id,
        createdAt: now,
      });
      return success(res, { action: 'exit', reservationId: reservation.id, slot: reservation.slotNumber }, 'Exit recorded');
    }

    return error(res, 'Reservation already completed', 400);
  } catch (err) {
    return error(res, err.message);
  }
}

// POST /api/reservations/scan  — attendant scans QR to record entry/exit
function scanQR(req, res) {
  try {
    const { token } = req.body;
    const qr = readData('qr_codes').find(q => q.token === token);
    if (!qr) return error(res, 'Invalid QR code', 404);

    const reservation = findOne('reservations', 'id', qr.reservationId);
    if (!reservation) return error(res, 'Reservation not found', 404);
    if (reservation.status !== 'confirmed') return error(res, 'Reservation not confirmed', 400);

    const now = new Date().toISOString();

    if (!reservation.entryTime) {
      // First scan = entry
      updateById('reservations', reservation.id, { entryTime: now });
      updateById('parking_slots', reservation.slotId, { status: 'occupied' });
      return success(res, { action: 'entry', time: now, slot: reservation.slotNumber });
    } else {
      // Second scan = exit
      updateById('reservations', reservation.id, { exitTime: now, status: 'completed' });
      updateById('parking_slots', reservation.slotId, {
        status: 'available', reservedBy: null, reservedUntil: null,
      });
      updateById('qr_codes', qr.id, { used: true });
      return success(res, { action: 'exit', time: now, slot: reservation.slotNumber });
    }
  } catch (err) {
    return error(res, err.message);
  }
}

// DELETE /api/reservations/:id  — cancel
function cancelReservation(req, res) {
  try {
    const reservation = findOne('reservations', 'id', req.params.id);
    if (!reservation) return error(res, 'Reservation not found', 404);
    if (reservation.userId !== req.user.id && req.user.role !== 'admin') {
      return error(res, 'Access denied', 403);
    }
    if (['completed', 'cancelled'].includes(reservation.status)) {
      return error(res, 'Cannot cancel this reservation', 400);
    }
    updateById('reservations', reservation.id, { status: 'cancelled' });
    updateById('parking_slots', reservation.slotId, {
      status: 'available', reservedBy: null, reservedUntil: null,
    });
    return success(res, {}, 'Reservation cancelled');
  } catch (err) {
    return error(res, err.message);
  }
}

module.exports = {
  createReservation,
  getMyReservations,
  getReservation,
  confirmReservation,
  extendReservation,
  handleLprScan,
  scanQR,
  cancelReservation,
};
