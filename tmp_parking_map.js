
  requireAuth();
  initSidebar();

  let allSlots = [];
  let filteredSlots = [];
  let selectedSlot = null;
  let currentStats = { total: 0, occupied: 0, reserved: 0, available: 0 };
  let slotRectangles = [];
  const basePrice = 200;
  const canvas = document.getElementById('parking-canvas');
  const tooltip = document.getElementById('canvas-tooltip');

  bindCanvasEvents();

  function getDynamicPrice() {
    const total = currentStats.total || allSlots.length || 1;
    const occupied = currentStats.occupied || allSlots.filter(s => s.status === 'occupied').length;
    return Math.ceil(basePrice * (1 + occupied / total));
  }

  function setCanvasSize() {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return ctx;
  }

  function getSlotColor(status) {
    if (status === 'available') return '#bbf7d0';
    if (status === 'occupied') return '#fecaca';
    if (status === 'reserved') return '#fde68a';
    return '#e2e8f0';
  }

  function drawRoundedRect(ctx, x, y, width, height, radius) {
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, width, height, radius);
      return;
    }
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawMap(slots) {
    if (!canvas) return;
    const ctx = setCanvasSize();
    slotRectangles = [];
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.fillRect(0, 0, width, height);

    if (!slots.length) {
      ctx.fillStyle = '#64748b';
      ctx.font = '700 18px Inter';
      ctx.fillText('No slots found for current filter.', 24, 60);
      return;
    }

    const floors = [...new Set(slots.map(s => s.floor))].sort((a, b) => a - b);
    const padding = 24;
    const floorGap = 24;
    const floorHeight = (height - padding * 2 - floorGap * (floors.length - 1)) / floors.length;

    floors.forEach((floor, floorIndex) => {
      const floorSlots = slots.filter(s => s.floor === floor);
      const zones = [...new Set(floorSlots.map(s => s.zone))].sort();
      const zoneGap = 16;
      const zoneWidth = (width - padding * 2 - zoneGap * (zones.length - 1)) / zones.length;
      const floorY = padding + floorIndex * (floorHeight + floorGap);

      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(padding, floorY, width - padding * 2, floorHeight);
      ctx.fillStyle = '#0f172a';
      ctx.font = '700 16px Inter';
      ctx.fillText(`Floor ${floor}`, padding + 12, floorY + 24);
      ctx.fillStyle = '#64748b';
      ctx.font = '500 12px Inter';
      ctx.fillText(`${floorSlots.length} slots`, padding + 12, floorY + 42);

      zones.forEach((zone, zoneIndex) => {
        const zoneSlots = floorSlots.filter(s => s.zone === zone);
        const zoneX = padding + zoneIndex * (zoneWidth + zoneGap);
        const innerPadding = 16;
        const contentX = zoneX + innerPadding;
        const contentY = floorY + 60;
        const contentW = zoneWidth - innerPadding * 2;
        const headerHeight = 26;

        ctx.fillStyle = 'rgba(15,23,42,.04)';
        ctx.fillRect(zoneX, floorY + 14, zoneWidth, floorHeight - 28);
        ctx.fillStyle = '#111827';
        ctx.font = '700 13px Inter';
        ctx.fillText(`Zone ${zone}`, contentX, floorY + 34);

        const cols = 3;
        const rows = Math.ceil(zoneSlots.length / cols) || 1;
        const cellGap = 12;
        const cellSize = Math.min(
          (contentW - (cols - 1) * cellGap) / cols,
          (floorHeight - 100 - (rows - 1) * cellGap) / rows,
          100
        );

        zoneSlots.forEach((slot, index) => {
          const row = Math.floor(index / cols);
          const col = index % cols;
          const x = contentX + col * (cellSize + cellGap);
          const y = contentY + row * (cellSize + cellGap);

          ctx.fillStyle = getSlotColor(slot.status);
          ctx.strokeStyle = slot.status === 'available' ? '#10b981' : slot.status === 'occupied' ? '#ef4444' : '#f59e0b';
          ctx.lineWidth = 2;
          drawRoundedRect(ctx, x, y, cellSize, cellSize, 16);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#0f172a';
          ctx.font = '700 12px Inter';
          ctx.fillText(slot.slotNumber, x + 10, y + 22);
          ctx.font = '500 11px Inter';
          ctx.fillText(slot.status.charAt(0).toUpperCase() + slot.status.slice(1), x + 10, y + cellSize - 12);

          slotRectangles.push({
            x,
            y,
            width: cellSize,
            height: cellSize,
            slot,
          });
        });
      });
    });
  }

  function positionTooltip(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left + 16;
    const y = event.clientY - rect.top + 16;
    tooltip.style.left = `${Math.min(x, rect.width - tooltip.offsetWidth - 16)}px`;
    tooltip.style.top = `${Math.min(y, rect.height - tooltip.offsetHeight - 16)}px`;
  }

  function bindCanvasEvents() {
    if (!canvas) return;
    canvas.addEventListener('mousemove', event => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const match = slotRectangles.find(item => x >= item.x && x <= item.x + item.width && y >= item.y && y <= item.y + item.height);
      if (match) {
        canvas.style.cursor = match.slot.status === 'available' ? 'pointer' : 'not-allowed';
        tooltip.classList.remove('hidden');
        tooltip.innerHTML = `<strong>${match.slot.slotNumber}</strong><br>Zone ${match.slot.zone} â€¢ Floor ${match.slot.floor}<br>Status: ${match.slot.status}`;
        positionTooltip(event);
      } else {
        canvas.style.cursor = 'default';
        tooltip.classList.add('hidden');
      }
    });

    canvas.addEventListener('click', event => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const match = slotRectangles.find(item => x >= item.x && x <= item.x + item.width && y >= item.y && y <= item.y + item.height);
      if (match && match.slot.status === 'available') {
        openModal(match.slot.id, match.slot.slotNumber, match.slot.zone);
      }
    });

    window.addEventListener('resize', () => {
      if (filteredSlots.length) drawMap(filteredSlots);
    });
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
      </div>
    `;
  }

  async function loadSlots() {
    try {
      const data = await api('/parking/slots');
      allSlots = data.data.slots;
      filteredSlots = allSlots;
      currentStats = data.data.stats;
      updatePricingSummary();
      drawMap(filteredSlots);
    } catch (err) {
      showAlert('alert', err.message, 'error');
    }
  }

  function filterSlots() {
    const floor = document.getElementById('floor-filter').value;
    const zone  = document.getElementById('zone-filter').value;
    filteredSlots = allSlots;
    if (floor) filteredSlots = filteredSlots.filter(s => s.floor == floor);
    if (zone)  filteredSlots = filteredSlots.filter(s => s.zone === zone);
    updatePricingSummary();
    drawMap(filteredSlots);
  }

  function openModal(slotId, slotNumber, zone) {
    selectedSlot = { id: slotId, slotNumber, zone };
    const price = getDynamicPrice();
    document.getElementById('modal-title').textContent  = `Reserve Slot ${slotNumber}`;
    document.getElementById('modal-slot-info').textContent = `Zone ${zone} â€” congestion-adjusted fee KES ${price}`;
    document.getElementById('amount').value = price;
    const user = getUser();
    document.getElementById('mpesa-phone').value = user?.phone || '';
    // Default arrival: 1 hour from now
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
    const phone       = document.getElementById('mpesa-phone').value.trim();
    const amount      = parseInt(document.getElementById('amount').value);

    if (!arrivalTime || !phone) {
      return showAlert('modal-alert', 'Please fill in all fields', 'error');
    }

    setLoading('reserve-btn', true, 'Pay & Reserve');
    try {
      // 1. Create reservation
      const resData = await api('/reservations', {
        method: 'POST',
        body: { slotId: selectedSlot.id, arrivalTime: new Date(arrivalTime).toISOString() },
      });
      const reservationId = resData.data.reservation.id;

      // 2. Initiate payment
      await api('/payments/initiate', {
        method: 'POST',
        body: { reservationId, amount, phone },
      });

      // 3. Confirm reservation (generates QR)
      const confirmed = await api(`/reservations/${reservationId}/confirm`, { method: 'POST' });

      showAlert('alert', `âœ… Slot ${selectedSlot.slotNumber} reserved! QR code generated.`, 'success');
      closeModal();
      loadSlots();

      // Redirect to QR page
      setTimeout(() => window.location.href = '/qr-code', 1500);
    } catch (err) {
      showAlert('modal-alert', err.message, 'error');
    } finally {
      setLoading('reserve-btn', false, 'Pay & Reserve');
    }
  }

  loadSlots();

