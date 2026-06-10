const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const authRoutes = require('./routes/auth');
const parkingRoutes = require('./routes/parking');
const reservationRoutes = require('./routes/reservations');
const rideRoutes = require('./routes/rides');
const paymentRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');
const { readData, updateById, insert } = require('./utils/db');
const { generateId } = require('./utils/generateId');

const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// ── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ──────────────────────────────────────────────
app.use('/api/auth',         authRoutes);
app.use('/api/parking',      parkingRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/rides',        rideRoutes);
app.use('/api/payments',     paymentRoutes);
app.use('/api/admin',        adminRoutes);

app.get('/api/config', (req, res) => {
  res.json({ data: { mapboxToken: process.env.MAPBOX_TOKEN || '' } });
});

app.post('/api/hook/slot-status', (req, res) => {
  const { slotId, zone, status, timestamp } = req.body;
  if (!slotId || !status) {
    return res.status(400).json({ message: 'slotId and status are required.' });
  }

  const updatedSlot = updateById('parking_slots', slotId, { status });
  if (!updatedSlot) {
    return res.status(404).json({ message: 'Slot not found.' });
  }

  const payload = {
    slotId,
    zone: zone || updatedSlot.zone,
    status,
    timestamp: timestamp || new Date().toISOString(),
  };
  broadcastSocket('slot_status_change', payload);
  return res.json({ data: { slot: updatedSlot }, message: 'Slot status updated and broadcasted.' });
});

app.post('/api/hook/vehicle-position', (req, res) => {
  const { vehicleId, reservationId, currentCoordinates, bearingAngle, speedKmH } = req.body;
  if (!vehicleId || !Array.isArray(currentCoordinates) || currentCoordinates.length !== 2) {
    return res.status(400).json({ message: 'vehicleId and currentCoordinates [lat,lng] are required.' });
  }

  const payload = {
    vehicleId,
    reservationId: reservationId || null,
    currentCoordinates,
    bearingAngle: bearingAngle || 0,
    speedKmH: speedKmH || 0,
    timestamp: new Date().toISOString(),
  };
  broadcastSocket('vehicle_position_update', payload);
  return res.json({ data: payload, message: 'Vehicle position broadcasted.' });
});

// ── Serve HTML pages ────────────────────────────────────────
app.get('/',                (req, res) => res.sendFile(path.join(__dirname, 'public/pages/login.html')));
app.get('/register',        (req, res) => res.sendFile(path.join(__dirname, 'public/pages/register.html')));
app.get('/dashboard',       (req, res) => res.sendFile(path.join(__dirname, 'public/pages/dashboard.html')));
app.get('/parking-map',     (req, res) => res.sendFile(path.join(__dirname, 'public/pages/parking-map.html')));
app.get('/reservations',    (req, res) => res.sendFile(path.join(__dirname, 'public/pages/reservations.html')));
app.get('/qr-code',         (req, res) => res.sendFile(path.join(__dirname, 'public/pages/qr-code.html')));
app.get('/shared-mobility', (req, res) => res.sendFile(path.join(__dirname, 'public/pages/shared-mobility.html')));
app.get('/admin',           (req, res) => res.sendFile(path.join(__dirname, 'public/pages/admin.html')));

// ── Global error handler ────────────────────────────────────
app.use(errorHandler);

const wss = new WebSocket.Server({ server, path: '/ws' });

function broadcastSocket(event, payload) {
  const message = JSON.stringify({ event, payload });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ event: 'connection', payload: { message: 'Connected to SmartPark realtime feed' } }));
  socket.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.event === 'ping') {
        socket.send(JSON.stringify({ event: 'pong', payload: { timestamp: new Date().toISOString() } }));
      }
    } catch (err) {
      // ignore invalid messages
    }
  });
  socket.on('close', () => {
    // connection closed
  });
});

function cleanupExpiredReservations() {
  try {
    const now = new Date();
    const reservations = readData('reservations');
    const notifications = readData('notifications');

    reservations
      .filter(r => r.status === 'confirmed' && r.expiresAt && new Date(r.expiresAt) < now)
      .forEach((reservation) => {
        updateById('reservations', reservation.id, { status: 'cancelled' });
        updateById('parking_slots', reservation.slotId, {
          status: 'available', reservedBy: null, reservedUntil: null,
        });
        insert('notifications', {
          id: generateId('n'),
          userId: reservation.userId,
          type: 'reservation_expired',
          reservationId: reservation.id,
          message: `Reservation ${reservation.slotNumber} expired and was released.`,
          read: false,
          createdAt: now.toISOString(),
        });
      });

    reservations
      .filter(r => r.status === 'confirmed' && r.expiresAt)
      .forEach((reservation) => {
        const remaining = new Date(reservation.expiresAt) - now;
        if (remaining <= 15 * 60 * 1000 && remaining > 0) {
          const alreadyNotified = notifications.some(n =>
            n.type === 'extension_reminder' && n.reservationId === reservation.id
          );
          if (!alreadyNotified) {
            insert('notifications', {
              id: generateId('n'),
              userId: reservation.userId,
              type: 'extension_reminder',
              reservationId: reservation.id,
              message: `Reservation ${reservation.slotNumber} expires in less than 15 minutes. Extend now with M-Pesa.`,
              read: false,
              createdAt: now.toISOString(),
            });
          }
        }
      });
  } catch (err) {
    console.error('Expiry cleanup failed:', err.message);
  }
}

cleanupExpiredReservations();
setInterval(cleanupExpiredReservations, 60 * 1000);
server.listen(PORT, () => {
  console.log(`\n🚗 Smart Parking System running at http://localhost:${PORT}\n`);
});

module.exports = { app, server };
