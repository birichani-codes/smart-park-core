const { findOne, insert, updateById } = require('../utils/db');
const { generateId } = require('../utils/generateId');
const { success, error } = require('../utils/response');

/**
 * Simulate an M-Pesa STK Push.
 * In production this would call the Safaricom Daraja API.
 * Here we simulate by generating a fake receipt code.
 */
function simulateMpesaPush(phone, amount) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const code = 'QGH' + Math.random().toString(36).substring(2, 9).toUpperCase();
      resolve({ success: true, mpesaCode: code, phone, amount });
    }, 800); // simulate network delay
  });
}

// POST /api/payments/initiate
async function initiatePayment(req, res) {
  try {
    const { reservationId, rideId, amount, phone } = req.body;
    const userId = req.user.id;

    if (!reservationId && !rideId) {
      return error(res, 'Either reservationId or rideId is required', 400);
    }

    // Simulate STK push
    const mpesaResult = await simulateMpesaPush(phone || req.user.phone, amount);

    if (!mpesaResult.success) {
      return error(res, 'Payment failed. Please try again.', 402);
    }

    const payment = insert('payments', {
      id: generateId('p'),
      userId,
      reservationId: reservationId || null,
      rideId: rideId || null,
      amount,
      phone: mpesaResult.phone,
      method: 'mpesa',
      status: 'completed',
      mpesaCode: mpesaResult.mpesaCode,
      createdAt: new Date().toISOString(),
    });

    // Link payment to reservation if applicable
    if (reservationId) {
      updateById('reservations', reservationId, { paymentId: payment.id });
    }

    // Add notification
    insert('notifications', {
      id: generateId('n'),
      userId,
      type: 'payment_received',
      message: `Payment of KES ${amount} received. M-Pesa code: ${payment.mpesaCode}`,
      read: false,
      createdAt: new Date().toISOString(),
    });

    return success(res, { payment }, 'Payment successful');
  } catch (err) {
    return error(res, err.message);
  }
}

// GET /api/payments/my
function getMyPayments(req, res) {
  try {
    const { readData } = require('../utils/db');
    const payments = readData('payments').filter(p => p.userId === req.user.id);
    return success(res, { payments });
  } catch (err) {
    return error(res, err.message);
  }
}

// GET /api/payments/:id
function getPayment(req, res) {
  try {
    const payment = findOne('payments', 'id', req.params.id);
    if (!payment) return error(res, 'Payment not found', 404);
    if (payment.userId !== req.user.id && req.user.role !== 'admin') {
      return error(res, 'Access denied', 403);
    }
    return success(res, { payment });
  } catch (err) {
    return error(res, err.message);
  }
}

module.exports = { initiatePayment, getMyPayments, getPayment };
