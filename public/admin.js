(function () {
  const loginScreen = document.getElementById('admin-login-screen');
  const dashboard = document.getElementById('admin-dashboard');
  const loginBtn = document.getElementById('admin-login-btn');
  const loginError = document.getElementById('admin-login-error');

  const visaTypeSelect = document.getElementById('admin-visa-type');
  const centerSelect = document.getElementById('admin-center-select');

  const calendarGrid = document.getElementById('admin-calendar-grid');
  const calendarMonthLabel = document.getElementById('admin-calendar-month-label');
  const prevMonthBtn = document.getElementById('admin-prev-month-btn');
  const nextMonthBtn = document.getElementById('admin-next-month-btn');

  const selectedDateLabel = document.getElementById('admin-selected-date-label');
  const dateStatusSelect = document.getElementById('admin-date-status');
  const saveDateStatusBtn = document.getElementById('admin-save-date-status-btn');

  const slotsEditor = document.getElementById('admin-slots-editor');
  const saveSlotsBtn = document.getElementById('admin-save-slots-btn');

  const simulateDropBtn = document.getElementById('simulate-drop-btn');
  const heavyLoadToggle = document.getElementById('heavy-load-toggle');
  const jsonPreviewEl = document.getElementById('json-preview');

  let currentMonth = new Date();
  currentMonth.setDate(1);
  let selectedDate = null;
  let currentDaySlots = {};

  loginBtn.addEventListener('click', () => {
    const u = document.getElementById('admin-username').value;
    const p = document.getElementById('admin-password').value;

    if (u === 'admin' && p === 'admin123') {
      loginError.textContent = '';
      loginScreen.classList.add('hidden');
      dashboard.classList.remove('hidden');
      loadMonth();
      refreshJsonPreview();
    } else {
      loginError.textContent = 'Invalid admin credentials.';
    }
  });

  function formatMonthKey(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  function formatDisplayMonth(dateObj) {
    const opts = { month: 'long', year: 'numeric' };
    return dateObj.toLocaleDateString(undefined, opts);
  }

  function adminFetch(url, options = {}) {
    const delay = 200 + Math.random() * 600;
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        fetch(url, {
          headers: { 'Content-Type': 'application/json' },
          ...options
        })
          .then((res) => {
            if (!res.ok) {
              reject(new Error('HTTP ' + res.status));
              return;
            }
            return res.json();
          })
          .then(resolve)
          .catch(reject);
      }, delay);
    });
  }

  function loadMonth() {
    const monthKey = formatMonthKey(currentMonth);
    calendarMonthLabel.textContent = formatDisplayMonth(currentMonth);
    const center = centerSelect.value;
    const visaType = visaTypeSelect.value;

    adminFetch(`/api/slots?center=${encodeURIComponent(center)}&type=${encodeURIComponent(visaType)}&month=${encodeURIComponent(monthKey)}`)
      .then((data) => {
        buildCalendarGrid(data.days || []);
      })
      .catch(() => {
        buildCalendarGrid([]);
      });
  }

  function buildCalendarGrid(daysData) {
    calendarGrid.innerHTML = '';

    const headerNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    headerNames.forEach((d) => {
      const h = document.createElement('div');
      h.textContent = d;
      h.className = 'calendar-day-header';
      calendarGrid.appendChild(h);
    });

    const firstDay = new Date(currentMonth.getTime());
    const startWeekday = (firstDay.getDay() + 6) % 7;
    const month = currentMonth.getMonth();
    const year = currentMonth.getFullYear();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const map = {};
    daysData.forEach((d) => (map[d.date] = d.status));

    for (let i = 0; i < startWeekday; i++) {
      const cell = document.createElement('div');
      cell.className = 'calendar-cell inactive';
      calendarGrid.appendChild(cell);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      const iso = dateObj.toISOString().slice(0, 10);
      const status = map[iso] || 'na';

      const cell = document.createElement('div');
      cell.className = 'calendar-cell';
      cell.dataset.date = iso;
      cell.dataset.status = status;
      cell.textContent = d;

      cell.addEventListener('click', () => {
        document
          .querySelectorAll('#admin-calendar-grid .calendar-cell.selected')
          .forEach((c) => c.classList.remove('selected'));
        cell.classList.add('selected');
        selectedDate = iso;
        selectedDateLabel.textContent = `Selected date: ${iso}`;
        dateStatusSelect.value = status;
        loadDaySlots(iso);
      });

      calendarGrid.appendChild(cell);
    }
  }

  function loadDaySlots(dateStr) {
    if (!dateStr) return;
    const center = centerSelect.value;
    const visaType = visaTypeSelect.value;
    slotsEditor.innerHTML = 'Loading...';

    adminFetch(`/api/slots/day?date=${encodeURIComponent(dateStr)}&center=${encodeURIComponent(center)}&type=${encodeURIComponent(visaType)}`)
      .then((data) => {
        currentDaySlots = data.slots || {};
        renderSlotEditor(currentDaySlots);
      })
      .catch(() => {
        slotsEditor.innerHTML = '<div class="error-text">Failed to load slots.</div>';
      });
  }

  function renderSlotEditor(slotsObj) {
    slotsEditor.innerHTML = '';
    const times = Object.keys(slotsObj).sort();
    if (times.length === 0) {
      slotsEditor.textContent = 'No slots configured.';
      return;
    }

    times.forEach((time) => {
      const status = slotsObj[time];
      const row = document.createElement('div');
      row.className = 'slot-row';
      const label = document.createElement('label');
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.justifyContent = 'space-between';
      label.style.width = '100%';

      const left = document.createElement('span');
      left.textContent = time;

      const right = document.createElement('span');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = status === 'available';
      checkbox.dataset.slot = time;

      const txt = document.createElement('span');
      txt.textContent = 'Available';
      txt.style.marginLeft = '4px';

      right.appendChild(checkbox);
      right.appendChild(txt);

      label.appendChild(left);
      label.appendChild(right);

      row.appendChild(label);
      slotsEditor.appendChild(row);
    });
  }

  saveDateStatusBtn.addEventListener('click', () => {
    if (!selectedDate) return;
    const center = centerSelect.value;
    const visaType = visaTypeSelect.value;
    const status = dateStatusSelect.value;

    adminFetch('/api/admin/updateDateStatus', {
      method: 'POST',
      body: JSON.stringify({ date: selectedDate, center, type: visaType, status })
    })
      .then(() => {
        loadMonth();
        refreshJsonPreview();
      })
      .catch(() => {
        alert('Failed to save date status');
      });
  });

  saveSlotsBtn.addEventListener('click', () => {
    if (!selectedDate) return;
    const center = centerSelect.value;
    const visaType = visaTypeSelect.value;

    const checkboxes = slotsEditor.querySelectorAll('input[type="checkbox"][data-slot]');
    const tasks = [];
    checkboxes.forEach((cb) => {
      const slot = cb.dataset.slot;
      const status = cb.checked ? 'available' : 'booked';
      tasks.push(
        adminFetch('/api/admin/updateSlotStatus', {
          method: 'POST',
          body: JSON.stringify({ date: selectedDate, center, type: visaType, slot, status })
        })
      );
    });

    Promise.allSettled(tasks).then(() => {
      loadDaySlots(selectedDate);
      refreshJsonPreview();
    });
  });

  simulateDropBtn.addEventListener('click', () => {
    const center = centerSelect.value;
    const visaType = visaTypeSelect.value;
    const monthKey = formatMonthKey(currentMonth);

    adminFetch('/api/admin/simulateDrop', {
      method: 'POST',
      body: JSON.stringify({ month: monthKey, center, type: visaType })
    })
      .then((data) => {
        alert('Slot drop simulated for ' + data.droppedDate);
        loadMonth();
        refreshJsonPreview();
      })
      .catch(() => {
        alert('No NA days to convert or failed call.');
      });
  });

  heavyLoadToggle.addEventListener('change', () => {
    const enabled = heavyLoadToggle.checked;
    adminFetch('/api/admin/toggleHeavyLoad', {
      method: 'POST',
      body: JSON.stringify({ enabled })
    })
      .then(() => {
        refreshJsonPreview();
      })
      .catch(() => {
        alert('Failed to toggle heavy load');
      });
  });

  function refreshJsonPreview() {
    const center = centerSelect.value;
    const visaType = visaTypeSelect.value;
    const monthKey = formatMonthKey(currentMonth);

    adminFetch(`/api/admin/jsonPreview?center=${encodeURIComponent(center)}&type=${encodeURIComponent(visaType)}&month=${encodeURIComponent(monthKey)}`)
      .then((data) => {
        jsonPreviewEl.textContent = JSON.stringify(data.raw || {}, null, 2);
      })
      .catch(() => {
        jsonPreviewEl.textContent = 'Failed to load JSON preview';
      });
  }

  prevMonthBtn.addEventListener('click', () => {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    loadMonth();
    refreshJsonPreview();
  });

  nextMonthBtn.addEventListener('click', () => {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    loadMonth();
    refreshJsonPreview();
  });

  visaTypeSelect.addEventListener('change', () => {
    loadMonth();
    refreshJsonPreview();
  });

  centerSelect.addEventListener('change', () => {
    loadMonth();
    refreshJsonPreview();
  });
})();
