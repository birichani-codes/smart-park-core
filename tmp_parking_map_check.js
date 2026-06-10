
  requireAuth();
  initSidebar();

  let allSlots = [];
  let filteredSlots = [];
  let selectedSlot = null;
  let currentStats = { total: 0, occupied: 0, reserved: 0, available: 0 };
  let map;
  let mapboxToken = '';
  const vehicleSourceData = { type: 'FeatureCollection', features: [] };
  const activeVehicles = {};
  const MAP_CENTER = [36.8234, -1.2633];
  const mapStatus = document.getElementById('map-status');
  const mapSummary = document.getElementById('map-summary');

  const trafficSegments = [
    {
      id: 'thika-superhighway',
      name: 'Thika Superhighway / A2',
      speedKmH: 18,
      coordinates: [[36.8280, -1.2574], [36.8240, -1.2608], [36.8208, -1.2633]],
    },
    {
      id: 'northern-bypass',
      name: 'Northern Bypass',
      speedKmH: 14,
      coordinates: [[36.8208, -1.2633], [36.8148, -1.2590], [36.8098, -1.2550]],
    },
    {
      id: 'limuru-road',
      name: 'Limuru Road (C62)',
      speedKmH: 42,
      coordinates: [[36.8234, -1.2633], [36.8231, -1.2689], [36.8227, -1.2735]],
    },
  ];

  const perimeterBoundary = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [36.8225, -1.2618],
        [36.8256, -1.2626],
        [36.8250, -1.2660],
        [36.8218, -1.2653],
        [36.8225, -1.2618],
      ]],
    },
    properties: {
      name: 'Two Rivers Mall Boundary',
    },
  };

  function getDynamicPrice() {
    const total = currentStats.total || allSlots.length || 1;
    const occupied = currentStats.occupied || allSlots.filter(s => s.status === 'occupied').length;
    return Math.ceil(200 * (1 + occupied / total));
  }

  function getSlotLngLat(slot) {
    const zoneOffsets = { A: 0, B: 0.00024, C: -0.00024 };
    const index = parseInt(slot.slotNumber.replace(/\D/g, ''), 10) || 1;
    const col = (index - 1) % 3;
    const row = Math.floor((index - 1) / 3);
    const floorOffset = (slot.floor - 1) * 0.00008;
    const lng = MAP_CENTER[0] + zoneOffsets[slot.zone] + (col - 1) * 0.00014;
    const lat = MAP_CENTER[1] - floorOffset + row * -0.0001;
    return [lng, lat];
  }

  function getMapFeature(slot) {
    return {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: getSlotLngLat(slot),
      },
      properties: {
        id: slot.id,
        number: slot.slotNumber,
        zone: slot.zone,
        floor: slot.floor,
        status: slot.status,
      },
    };
  }

  function buildSlotData(slots) {
    return {
      type: 'FeatureCollection',
      features: slots.map(getMapFeature),
    };
  }

  function initMap() {
    mapboxgl.accessToken = mapboxToken;
    map = new mapboxgl.Map({
      container: 'parking-map-canvas',
      style: 'https://api.mapbox.com/styles/v1/mapbox/dark-v11?access_token=' + mapboxToken,
      center: MAP_CENTER,
      zoom: 15.7,
      pitch: 42,
      bearing: -20,
      attributionControl: false,
    });

    map.on('load', () => {
      map.addSource('parking-slots', { type: 'geojson', data: buildSlotData(filteredSlots) });
      map.addSource('vehicle-positions', { type: 'geojson', data: vehicleSourceData, cluster: true, clusterRadius: 60 });
      map.addSource('traffic-lines', { type: 'geojson', data: { type: 'FeatureCollection', features: trafficSegments.map(segment => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: segment.coordinates }, properties: { name: segment.name, speed: segment.speedKmH } })) } });
      map.addSource('mall-boundary', { type: 'geojson', data: { type: 'FeatureCollection', features: [perimeterBoundary] } });

      map.addLayer({
        id: 'traffic-lines',
        type: 'line',
        source: 'traffic-lines',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-width': 6, 'line-color': ['case', ['<=', ['get', 'speed'], 20], '#ef4444', ['<=', ['get', 'speed'], 40], '#f59e0b', '#34d399'], 'line-opacity': 0.85 },
      });

      map.addLayer({
        id: 'mall-fence-fill',
        type: 'fill',
        source: 'mall-boundary',
        paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.08 },
      });

      map.addLayer({
        id: 'mall-fence-outline',
        type: 'line',
        source: 'mall-boundary',
        paint: { 'line-color': '#38bdf8', 'line-width': 2, 'line-dasharray': [2, 2] },
      });

      map.addLayer({
        id: 'slots-fill',
        type: 'circle',
        source: 'parking-slots',
        paint: {
          'circle-radius': 12,
          'circle-color': ['match', ['get', 'status'], 'available', '#34d399', 'occupied', '#f87171', 'reserved', '#fbbf24', '#94a3b8'],
          'circle-stroke-color': '#0f172a',
          'circle-stroke-width': 2,
        },
      });

      map.addLayer({
        id: 'slots-labels',
        type: 'symbol',
        source: 'parking-slots',
        layout: { 'text-field': ['get', 'number'], 'text-size': 12, 'text-offset': [0, 1.3], 'text-anchor': 'top' },
        paint: { 'text-color': '#f8fafc' },
      });

      map.addLayer({
        id: 'vehicle-clusters',
        type: 'circle',
        source: 'vehicle-positions',
        filter: ['has', 'point_count'],
        paint: { 'circle-color': '#14b8a6', 'circle-radius': ['step', ['get', 'point_count'], 18, 10, 26, 30, 34], 'circle-stroke-color': '#0f172a', 'circle-stroke-width': 2 },
      });

      map.addLayer({
        id: 'vehicle-cluster-count',
        type: 'symbol',
        source: 'vehicle-positions',
        filter: ['has', 'point_count'],
        layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 12 },
        paint: { 'text-color': '#ffffff' },
      });

      map.addLayer({
        id: 'vehicle-points',
        type: 'circle',
        source: 'vehicle-positions',
        filter: ['!', ['has', 'point_count']],
        paint: { 'circle-color': '#14b8a6', 'circle-radius': 10, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
      });

      map.addLayer({
        id: 'vehicle-labels',
        type: 'symbol',
        source: 'vehicle-positions',
        filter: ['!', ['has', 'point_count']],
        layout: { 'text-field': ['get', 'label'], 'text-offset': [0, 1.3], 'text-size': 11 },
        paint: { 'text-color': '#e2e8f0' },
      });

      map.on('click', 'slots-fill', e => {
        const props = e.features[0].properties;
        if (props.status === 'available') openModal(props.id, props.number, props.zone);
      });

      map.on('click', 'vehicle-clusters', e => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['vehicle-clusters'] });
        const clusterId = features[0].properties.cluster_id;
        map.getSource('vehicle-positions').getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          map.easeTo({ center: features[0].geometry.coordinates, zoom });
        });
      });

      map.on('click', 'vehicle-points', e => {
        const props = e.features[0].properties;
        const vehicle = activeVehicles[props.vehicleId];
        if (vehicle) {
          document.getElementById('slot-sheet').innerHTML = `
            <div class="sheet-header">
              <div>
                <h3>${vehicle.label}</h3>
                <span>${vehicle.route} • ${vehicle.status}</span>
              </div>
              <button class="btn btn-ghost" onclick="document.getElementById('slot-sheet').classList.add('hidden')">Close</button>
            </div>
            <div class="sheet-body">
              <p>ETA: <strong>${vehicle.eta}</strong></p>
              <p>Operator: <strong>${vehicle.operator}</strong></p>
              <p>Contact: <strong>${vehicle.contact}</strong></p>
            </div>`;
          document.getElementById('slot-sheet').classList.remove('hidden');
        }
      });

      map.on('mouseenter', 'slots-fill', () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', 'slots-fill', () => map.getCanvas().style.cursor = '');
      map.on('mouseenter', 'vehicle-points', () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', 'vehicle-points', () => map.getCanvas().style.cursor = '');

      updateSlotSource();
      updateVehicleSource();
      updateTrafficData();
      updateOperationalSheet();
    });
  }

  function updateTrafficData() {
    if (!map || !map.getSource('traffic-lines')) return;
    const payload = { type: 'FeatureCollection', features: trafficSegments.map(segment => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: segment.coordinates }, properties: { name: segment.name, speed: segment.speedKmH } })) };
    map.getSource('traffic-lines').setData(payload);
  }

  function scheduleTrafficSimulation() {
    setInterval(() => {
      trafficSegments.forEach(segment => {
        segment.speedKmH = Math.max(12, Math.min(55, segment.speedKmH + Math.floor(Math.random() * 11) - 4));
      });
      updateTrafficData();
    }, 15000);
  }

  function getVehicleFeature(vehicle) {
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: vehicle.currentCoordinates },
      properties: { vehicleId: vehicle.vehicleId, label: vehicle.label, route: vehicle.route, status: vehicle.status },
    };
  }

  function updateVehicleSource() {
    if (!map || !map.getSource('vehicle-positions')) return;
    const features = Object.values(activeVehicles).map(getVehicleFeature);
    map.getSource('vehicle-positions').setData({ type: 'FeatureCollection', features });
    document.getElementById('fleet-metrics').textContent = `${features.length} active vehicles • ${Object.values(activeVehicles).filter(v => v.status.toLowerCase().includes('approach') || v.status.toLowerCase().includes('arriv')).length} approaching`;
  }

  function updateVehiclePosition(payload) {
    if (!payload.vehicleId || !Array.isArray(payload.currentCoordinates)) return;
    activeVehicles[payload.vehicleId] = {
      vehicleId: payload.vehicleId,
      label: payload.vehicleId,
      route: payload.route || 'Inbound route',
      currentCoordinates: payload.currentCoordinates,
      status: payload.status || 'Approaching',
      eta: payload.eta || '5 min',
      operator: payload.operator || 'Dispatch team',
      contact: payload.contact || '0722 000 000',
    };
    updateVehicleSource();
    updateOperationalSheet();
  }

  function updateOperationalSheet() {
    const sheet = document.getElementById('slot-sheet');
    const vehicles = Object.values(activeVehicles);
    const queueCount = currentStats.reserved + vehicles.length;
    const activities = vehicles.length ? vehicles.map(vehicle => ({ title: vehicle.label, subtitle: `${vehicle.route} • ${vehicle.status}`, detail: `ETA ${vehicle.eta} • ${vehicle.operator} • ${vehicle.contact}` })) : [{ title: 'No active fleet paths yet', subtitle: 'Awaiting live vehicle location streams.', detail: '' }];

    sheet.innerHTML = `
      <div class="sheet-header">
        <div>
          <h3>Operational dispatch</h3>
          <span>${queueCount} active vehicles / reservations</span>
        </div>
        <button class="btn btn-ghost" onclick="document.getElementById('slot-sheet').classList.add('hidden')">Close</button>
      </div>
      <div class="sheet-body">
        <div class="meta-row">
          <span>Pickup queue: <strong>${queueCount}</strong></span>
          <span>Fleet routes: <strong>${vehicles.length}</strong></span>
        </div>
        <div class="sheet-list">
          ${activities.map(item => `
            <div class="sheet-item">
              <div>
                <strong>${item.title}</strong>
                <div class="text-muted">${item.subtitle}</div>
              </div>
              <div class="sheet-meta">${item.detail}</div>
            </div>
          `).join('')}
        </div>
        <div class="bottom-action">
          <button class="btn btn-primary" onclick="showAlert('alert','Realtime fleet view updated','success')">Refresh live feed</button>
          <button class="btn btn-outline" onclick="loadSlots()">Reload parking slots</button>
        </div>
      </div>`;
    sheet.classList.remove('hidden');
  }

  function refreshConfig() {
    return api('/config').then(data => {
      if (data.data?.mapboxToken) mapboxToken = data.data.mapboxToken;
      if (!mapboxToken) {
        mapStatus.textContent = 'Mapbox token is required for live geospatial map.';
        return false;
      }
      return true;
    }).catch(err => {
      mapStatus.textContent = 'Unable to load map configuration';
      showAlert('alert', err.message, 'error');
      return false;
    });
  }

  async function initializeMapPage() {
    const hasToken = await refreshConfig();
    if (!hasToken) return;

    await loadSlots();
    if (!map) initMap();
    scheduleTrafficSimulation();
    connectRealtime();
    setInterval(() => refreshConfig(), 90000);
  }

  async function loadSlots() {
    try {
      const data = await api('/parking/slots');
      allSlots = data.data.slots || [];
      filteredSlots = [...allSlots];
      currentStats = data.data.stats || { total: allSlots.length, occupied: 0, reserved: 0, available: 0 };
      updatePricingSummary();
      updateMapSummary();
      if (map) updateSlotSource();
    } catch (err) {
      showAlert('alert', err.message, 'error');
    }
  }

  function filterSlots() {
    const floor = document.getElementById('floor-filter').value;
    const zone = document.getElementById('zone-filter').value;
    filteredSlots = allSlots.filter(slot => {
      return (!floor || slot.floor == floor) && (!zone || slot.zone === zone);
    });
    updatePricingSummary();
    updateMapSummary();
    updateSlotSource();
    if (filteredSlots.length && map) {
      map.flyTo({ center: getSlotLngLat(filteredSlots[0]), zoom: 17, speed: 0.9 });
    }
  }

  function applyViewport() {
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    const mode = document.getElementById('mode-select').value;
    if (!query) {
      showAlert('alert', `Showing filtered map in ${mode} mode.`, 'success');
      return;
    }

    const routeMatch = trafficSegments.find(segment => segment.name.toLowerCase().includes(query));
    const slotMatch = allSlots.find(slot => slot.slotNumber.toLowerCase().includes(query) || slot.zone.toLowerCase() === query || slot.status === query);
    const vehicleMatch = Object.values(activeVehicles).find(v => v.vehicleId.toLowerCase().includes(query) || v.route.toLowerCase().includes(query));

    if (vehicleMatch && map) {
      map.flyTo({ center: vehicleMatch.currentCoordinates, zoom: 16.5, speed: 0.9 });
      showAlert('alert', `Focusing on ${vehicleMatch.vehicleId}`, 'success');
      return;
    }
    if (slotMatch && map) {
      map.flyTo({ center: getSlotLngLat(slotMatch), zoom: 18, speed: 0.9 });
      showAlert('alert', `Focusing on ${slotMatch.slotNumber} in ${slotMatch.zone}.`, 'success');
      return;
    }
    if (routeMatch && map) {
      const bounds = routeMatch.coordinates.reduce((bounds, coord) => bounds.extend(coord), new mapboxgl.LngLatBounds(routeMatch.coordinates[0], routeMatch.coordinates[0]));
      map.fitBounds(bounds, { padding: 120 });
      showAlert('alert', `Showing ${routeMatch.name}`, 'success');
      return;
    }
    showAlert('alert', 'No matching slot, route, or vehicle found.', 'error');
  }

  function openSlotCard(slot) {
    const sheet = document.getElementById('slot-sheet');
    sheet.innerHTML = `
      <div class="sheet-header">
        <div>
          <h3>${slot.slotNumber}</h3>
          <span>Zone ${slot.zone} • Floor ${slot.floor}</span>
        </div>
        <button class="btn btn-ghost" onclick="document.getElementById('slot-sheet').classList.add('hidden')">Close</button>
      </div>
      <div class="sheet-body">
        <p>Status: <strong>${slot.status}</strong></p>
        <p>Fee: <strong>KES ${getDynamicPrice()}</strong></p>
        <button class="btn btn-primary" onclick="openModal('${slot.id}','${slot.slotNumber}','${slot.zone}')">Reserve now</button>
      </div>`;
    sheet.classList.remove('hidden');
  }

  function openModal(slotId, slotNumber, zone) {
    selectedSlot = { id: slotId, slotNumber, zone };
    const price = getDynamicPrice();
    document.getElementById('modal-title').textContent = `Reserve Slot ${slotNumber}`;
    document.getElementById('modal-slot-info').textContent = `Zone ${zone} — congestion-adjusted fee KES ${price}`;
    document.getElementById('amount').value = price;
    const user = getUser();
    document.getElementById('mpesa-phone').value = user?.phone || '';
    const soon = new Date(Date.now() + 3600000);
    document.getElementById('arrival-time').value = soon.toISOString().slice(0, 16);
    document.getElementById('modal').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('modal').classList.add('hidden');
    selectedSlot = null;
  }

  async function doReserve() {
    const arrivalTime = document.getElementById('arrival-time').value;
    const phone = document.getElementById('mpesa-phone').value.trim();
    const amount = parseInt(document.getElementById('amount').value, 10);

    if (!arrivalTime || !phone) {
      return showAlert('modal-alert', 'Please fill in all fields', 'error');
    }

    setLoading('reserve-btn', true, 'Pay & Reserve');
    try {
      const resData = await api('/reservations', {
        method: 'POST',
        body: { slotId: selectedSlot.id, arrivalTime: new Date(arrivalTime).toISOString() },
      });
      const reservationId = resData.data.reservation.id;
      await api('/payments/initiate', {
        method: 'POST',
        body: { reservationId, amount, phone },
      });
      await api(`/reservations/${reservationId}/confirm`, { method: 'POST' });
      showAlert('alert', `✅ Slot ${selectedSlot.slotNumber} reserved.`, 'success');
      closeModal();
      loadSlots();
      setTimeout(() => window.location.href = '/qr-code', 1500);
    } catch (err) {
      showAlert('modal-alert', err.message, 'error');
    } finally {
      setLoading('reserve-btn', false, 'Pay & Reserve');
    }
  }

  function updatePricingSummary() {
    document.getElementById('pricing-summary').innerHTML = `
      <div class="summary-card">
        <span class="label">Current fee</span>
        <div class="value">KES ${getDynamicPrice()}</div>
      </div>
      <div class="summary-card">
        <span class="label">Occupancy</span>
        <div class="value">${currentStats.occupied}/${currentStats.total}</div>
      </div>
      <div class="summary-card">
        <span class="label">Reserved</span>
        <div class="value">${currentStats.reserved}</div>
      </div>`;
  }

  function connectRealtime() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socketUrl = `${protocol}://${window.location.host}/ws`;
    const ws = new WebSocket(socketUrl);

    ws.addEventListener('open', () => {
      mapStatus.textContent = 'Live updates connected';
      document.getElementById('connectivity-status').textContent = 'Backend health: connected';
      ws.send(JSON.stringify({ event: 'subscribe', channel: 'parking-map' }));
    });

    ws.addEventListener('message', message => {
      try {
        const data = JSON.parse(message.data);
        const payload = data.payload || {};
        if (data.event === 'slot_status_change') {
          const slot = allSlots.find(s => s.id === payload.slotId);
          if (slot) {
            slot.status = payload.status;
            slot.reservedBy = payload.reservedBy || slot.reservedBy;
            currentStats = { total: allSlots.length, occupied: allSlots.filter(s => s.status === 'occupied').length, reserved: allSlots.filter(s => s.status === 'reserved').length, available: allSlots.filter(s => s.status === 'available').length };
            updatePricingSummary();
            updateMapSummary();
            updateSlotSource();
          }
        }
        if (data.event === 'vehicle_position_update') {
          updateVehiclePosition(payload);
        }
      } catch (error) {
        console.error('Realtime parse error', error);
      }
    });

    ws.addEventListener('close', () => {
      mapStatus.textContent = 'Realtime disconnected. Reconnecting...';
      document.getElementById('connectivity-status').textContent = 'Backend health: reconnecting';
      setTimeout(connectRealtime, 2500);
    });

    ws.addEventListener('error', () => {
      mapStatus.textContent = 'Realtime connection error';
      document.getElementById('connectivity-status').textContent = 'Backend health: error';
      ws.close();
    });
  }

  function getVehicleFeature(vehicle) {
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: vehicle.currentCoordinates },
      properties: { vehicleId: vehicle.vehicleId, label: vehicle.label, route: vehicle.route, status: vehicle.status },
    };
  }

  function updateVehicleSource() {
    if (!map || !map.getSource('vehicle-positions')) return;
    const features = Object.values(activeVehicles).map(getVehicleFeature);
    map.getSource('vehicle-positions').setData({ type: 'FeatureCollection', features });
    document.getElementById('fleet-metrics').textContent = `${features.length} active vehicles • ${Object.values(activeVehicles).filter(v => v.status.toLowerCase().includes('approach') || v.status.toLowerCase().includes('arriv')).length} approaching`;
  }

  function updateVehiclePosition(payload) {
    if (!payload.vehicleId || !Array.isArray(payload.currentCoordinates)) return;
    activeVehicles[payload.vehicleId] = {
      vehicleId: payload.vehicleId,
      label: payload.vehicleId,
      route: payload.route || 'Inbound route',
      currentCoordinates: payload.currentCoordinates,
      status: payload.status || 'Approaching',
      eta: payload.eta || '5 min',
      operator: payload.operator || 'Dispatch team',
      contact: payload.contact || '0722 000 000',
    };
    updateVehicleSource();
    updateOperationalSheet();
  }

  function updateOperationalSheet() {
    const sheet = document.getElementById('slot-sheet');
    const vehicles = Object.values(activeVehicles);
    const queueCount = currentStats.reserved + vehicles.length;
    const activities = vehicles.length ? vehicles.map(vehicle => ({ title: vehicle.label, subtitle: `${vehicle.route} • ${vehicle.status}`, detail: `ETA ${vehicle.eta} • ${vehicle.operator} • ${vehicle.contact}` })) : [{ title: 'No active fleet paths yet', subtitle: 'Awaiting live vehicle location streams.', detail: '' }];

    sheet.innerHTML = `
      <div class="sheet-header">
        <div>
          <h3>Operational dispatch</h3>
          <span>${queueCount} active vehicles / reservations</span>
        </div>
        <button class="btn btn-ghost" onclick="document.getElementById('slot-sheet').classList.add('hidden')">Close</button>
      </div>
      <div class="sheet-body">
        <div class="meta-row">
          <span>Pickup queue: <strong>${queueCount}</strong></span>
          <span>Fleet routes: <strong>${vehicles.length}</strong></span>
        </div>
        <div class="sheet-list">
          ${activities.map(item => `
            <div class="sheet-item">
              <div>
                <strong>${item.title}</strong>
                <div class="text-muted">${item.subtitle}</div>
              </div>
              <div class="sheet-meta">${item.detail}</div>
            </div>
          `).join('')}
        </div>
        <div class="bottom-action">
          <button class="btn btn-primary" onclick="showAlert('alert','Realtime fleet view updated','success')">Refresh live feed</button>
          <button class="btn btn-outline" onclick="loadSlots()">Reload parking slots</button>
        </div>
      </div>`;
    sheet.classList.remove('hidden');
  }

  function updateTrafficData() {
    if (!map || !map.getSource('traffic-lines')) return;
    const payload = { type: 'FeatureCollection', features: trafficSegments.map(segment => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: segment.coordinates }, properties: { name: segment.name, speed: segment.speedKmH } })) };
    map.getSource('traffic-lines').setData(payload);
  }

  function scheduleTrafficSimulation() {
    setInterval(() => {
      trafficSegments.forEach(segment => {
        segment.speedKmH = Math.max(12, Math.min(55, segment.speedKmH + Math.floor(Math.random() * 11) - 4));
      });
      updateTrafficData();
    }, 15000);
  }

  function refreshConfig() {
    return api('/config').then(data => {
      if (data.data?.mapboxToken) mapboxToken = data.data.mapboxToken;
      if (!mapboxToken) {
        mapStatus.textContent = 'Mapbox token is required for live geospatial map.';
        return false;
      }
      return true;
    }).catch(err => {
      mapStatus.textContent = 'Unable to load map configuration';
      showAlert('alert', err.message, 'error');
      return false;
    });
  }

  async function initializeMapPage() {
    const hasToken = await refreshConfig();
    if (!hasToken) return;

    await loadSlots();
    if (!map) initMap();
    scheduleTrafficSimulation();
    connectRealtime();
    setInterval(() => refreshConfig(), 90000);
  }

  async function loadSlots() {
    try {
      const data = await api('/parking/slots');
      allSlots = data.data.slots || [];
      filteredSlots = [...allSlots];
      currentStats = data.data.stats || { total: allSlots.length, occupied: 0, reserved: 0, available: 0 };
      updatePricingSummary();
      updateMapSummary();
      if (map) updateSlotSource();
    } catch (err) {
      showAlert('alert', err.message, 'error');
    }
  }

  function filterSlots() {
    const floor = document.getElementById('floor-filter').value;
    const zone = document.getElementById('zone-filter').value;
    filteredSlots = allSlots.filter(slot => {
      return (!floor || slot.floor == floor) && (!zone || slot.zone === zone);
    });
    updatePricingSummary();
    updateMapSummary();
    updateSlotSource();
    if (filteredSlots.length && map) {
      map.flyTo({ center: getSlotLngLat(filteredSlots[0]), zoom: 17, speed: 0.9 });
    }
  }

  function applyViewport() {
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    const mode = document.getElementById('mode-select').value;
    if (!query) {
      showAlert('alert', `Showing filtered map in ${mode} mode.`, 'success');
      return;
    }

    const routeMatch = trafficSegments.find(segment => segment.name.toLowerCase().includes(query));
    const slotMatch = allSlots.find(slot => slot.slotNumber.toLowerCase().includes(query) || slot.zone.toLowerCase() === query || slot.status === query);
    const vehicleMatch = Object.values(activeVehicles).find(v => v.vehicleId.toLowerCase().includes(query) || v.route.toLowerCase().includes(query));

    if (vehicleMatch && map) {
      map.flyTo({ center: vehicleMatch.currentCoordinates, zoom: 16.5, speed: 0.9 });
      showAlert('alert', `Focusing on ${vehicleMatch.vehicleId}`, 'success');
      return;
    }
    if (slotMatch && map) {
      map.flyTo({ center: getSlotLngLat(slotMatch), zoom: 18, speed: 0.9 });
      showAlert('alert', `Focusing on ${slotMatch.slotNumber} in ${slotMatch.zone}.`, 'success');
      return;
    }
    if (routeMatch && map) {
      const bounds = routeMatch.coordinates.reduce((bounds, coord) => bounds.extend(coord), new mapboxgl.LngLatBounds(routeMatch.coordinates[0], routeMatch.coordinates[0]));
      map.fitBounds(bounds, { padding: 120 });
      showAlert('alert', `Showing ${routeMatch.name}`, 'success');
      return;
    }
    showAlert('alert', 'No matching slot, route, or vehicle found.', 'error');
  }

  window.applyViewport = applyViewport;
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.doReserve = doReserve;

  initializeMapPage();
