const { readData, findAll, findOne, insert, updateById } = require('../utils/db');
const { generateId } = require('../utils/generateId');
const { success, error } = require('../utils/response');

// POST /api/rides  — driver offers a ride
function offerRide(req, res) {
  try {
    const { origin, destination, departureTime, totalSeats, totalCost } = req.body;
    const driverId = req.user.id;

    const costPerSeat = Math.ceil(totalCost / totalSeats);

    const ride = insert('rides', {
      id: generateId('rd'),
      driverId,
      origin,
      destination,
      departureTime,
      totalSeats,
      availableSeats: totalSeats,
      totalCost,
      costPerSeat,
      status: 'open',
      passengers: [],
      createdAt: new Date().toISOString(),
    });

    return success(res, { ride }, 'Ride posted successfully', 201);
  } catch (err) {
    return error(res, err.message);
  }
}

// GET /api/rides  — list open rides, with optional ?destination=&seats=
function getRides(req, res) {
  try {
    const { destination, seats } = req.query;
    let rides = findAll('rides', { status: 'open' });

    if (destination) {
      const dest = destination.toLowerCase();
      rides = rides.filter(r => r.destination.toLowerCase().includes(dest));
    }
    if (seats) {
      rides = rides.filter(r => r.availableSeats >= parseInt(seats));
    }

    return success(res, { rides });
  } catch (err) {
    return error(res, err.message);
  }
}

// GET /api/rides/match  — match rides to a passenger request
function matchRides(req, res) {
  try {
    const { destination, departureTime, seats = 1 } = req.query;
    if (!destination || !departureTime) {
      return error(res, 'destination and departureTime are required', 400);
    }

    const reqTime = new Date(departureTime).getTime();
    const WINDOW_MS = 30 * 60 * 1000; // ±30 minutes

    const openRides = findAll('rides', { status: 'open' });

    const matched = openRides
      .filter(r => {
        const sameDest  = r.destination.toLowerCase().includes(destination.toLowerCase());
        const rideTime  = new Date(r.departureTime).getTime();
        const inWindow  = Math.abs(rideTime - reqTime) <= WINDOW_MS;
        const hasSeats  = r.availableSeats >= parseInt(seats);
        return sameDest && inWindow && hasSeats;
      })
      .sort((a, b) => {
        const aDiff = Math.abs(new Date(a.departureTime) - reqTime);
        const bDiff = Math.abs(new Date(b.departureTime) - reqTime);
        return aDiff - bDiff;
      });

    return success(res, { matched, count: matched.length });
  } catch (err) {
    return error(res, err.message);
  }
}

// POST /api/rides/:id/join  — passenger joins a ride
function joinRide(req, res) {
  try {
    const { seats = 1 } = req.body;
    const passengerId = req.user.id;

    const ride = findOne('rides', 'id', req.params.id);
    if (!ride) return error(res, 'Ride not found', 404);
    if (ride.status !== 'open') return error(res, 'Ride is no longer available', 400);
    if (ride.driverId === passengerId) return error(res, 'Driver cannot join own ride', 400);
    if (ride.availableSeats < seats) return error(res, 'Not enough available seats', 400);

    const newAvailable = ride.availableSeats - seats;
    const passengers   = [...ride.passengers, { userId: passengerId, seats, joinedAt: new Date().toISOString() }];
    const costPerSeat  = Math.ceil(ride.totalCost / (ride.totalSeats - newAvailable));

    const updatedRide = updateById('rides', ride.id, {
      availableSeats: newAvailable,
      passengers,
      costPerSeat,
      status: newAvailable === 0 ? 'full' : 'open',
    });

    // Log ride request
    const rideReq = insert('ride_requests', {
      id: generateId('rq'),
      rideId: ride.id,
      userId: passengerId,
      seats,
      costShare: costPerSeat * seats,
      status: 'matched',
      createdAt: new Date().toISOString(),
    });

    // Notify driver
    insert('notifications', {
      id: generateId('n'),
      userId: ride.driverId,
      type: 'ride_joined',
      message: `A passenger joined your ride to ${ride.destination}.`,
      read: false,
      createdAt: new Date().toISOString(),
    });

    return success(res, { ride: updatedRide, rideRequest: rideReq, costPerSeat });
  } catch (err) {
    return error(res, err.message);
  }
}

// GET /api/rides/my  — rides created or joined by current user
function getMyRides(req, res) {
  try {
    const userId = req.user.id;
    const allRides    = readData('rides');
    const asDriver    = allRides.filter(r => r.driverId === userId);
    const asPassenger = allRides.filter(r => r.passengers.some(p => p.userId === userId));
    return success(res, { asDriver, asPassenger });
  } catch (err) {
    return error(res, err.message);
  }
}

module.exports = { offerRide, getRides, matchRides, joinRide, getMyRides };
