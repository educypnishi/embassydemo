(function () {
  const loginScreen = document.getElementById('login-screen');
  const dashboard = document.getElementById('dashboard');
  const loginBtn = document.getElementById('login-btn');
  const loginError = document.getElementById('login-error');
  const csrfTokenInput = document.getElementById('csrf-token');
  const randomWrapper = document.getElementById('random-class-wrapper');

  const countrySelect = document.getElementById('country-select');
  const visaTypeSelect = document.getElementById('visa-type-select');
  const centerSelect = document.getElementById('center-select');
  const checkAppointmentsBtn = document.getElementById('check-appointments-btn');

  const calendarGrid = document.getElementById('calendar-grid');
  const calendarMonthLabel = document.getElementById('calendar-month-label');
  const prevMonthBtn = document.getElementById('prev-month-btn');
  const nextMonthBtn = document.getElementById('next-month-btn');

  const slotDateLabel = document.getElementById('slot-date-label');
  const slotsContainer = document.getElementById('slots-container');

  const sessionPopup = document.getElementById('session-popup');
  const sessionReloadBtn = document.getElementById('session-reload-btn');

  let currentMonth = new Date();
  currentMonth.setDate(1);

  let selectedDate = null;
  let lastMonthData = null;

  function regenerateCsrfToken() {
    const token = 'csrf_' + Math.random().toString(36).slice(2);
    csrfTokenInput.value = token;
  }

  function randomizeWrapperClass() {
    const base = 'wrapper-';
    const randomId = Math.random().toString(36).slice(2, 8);
    randomWrapper.className = base + randomId;
  }

  function maybeShowSessionExpired() {
    if (Math.random() < 0.03) {
      sessionPopup.classList.remove('hidden');
    }
  }

  sessionReloadBtn.addEventListener('click', () => {
    sessionPopup.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    dashboard.classList.add('hidden');
    regenerateCsrfToken();
  });

  loginBtn.addEventListener('click', () => {
    loginError.textContent = '';
    regenerateCsrfToken();
    setTimeout(() => {
      loginScreen.classList.add('hidden');
      dashboard.classList.remove('hidden');
      randomizeWrapperClass();
      loadMonth();
    }, 300 + Math.random() * 700);
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

    for (let i = 0; i < startWeekday; i++) {
      const cell = document.createElement('div');
      cell.className = 'calendar-cell inactive';
      calendarGrid.appendChild(cell);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      const iso = dateObj.toISOString().slice(0, 10);
      const dayInfo = daysData.find((x) => x.date === iso);
      const status = dayInfo ? dayInfo.status : 'na';

      const cell = document.createElement('div');
      cell.className = 'calendar-cell';
      cell.dataset.date = iso;
      cell.dataset.status = status;
      cell.textContent = d;

      cell.addEventListener('click', () => {
        if (cell.classList.contains('inactive')) return;
        document
          .querySelectorAll('.calendar-cell.selected')
          .forEach((c) => c.classList.remove('selected'));
        cell.classList.add('selected');
        selectedDate = iso;
        slotDateLabel.textContent = `Slots for ${iso}`;
        loadDaySlots(iso);
      });

      calendarGrid.appendChild(cell);
    }

    setTimeout(() => {
      if (Math.random() < 0.3) {
        const cells = calendarGrid.querySelectorAll('.calendar-cell');
        cells.forEach((c) => {
          if (Math.random() < 0.1) {
            c.classList.add('mut-' + Math.random().toString(36).slice(2, 5));
          }
        });
      }
    }, 10);
  }

  function apiFetch(url, options = {}) {
    const delay = 300 + Math.random() * 1200;
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        fetch(url, options)
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

    apiFetch(`/api/slots?center=${encodeURIComponent(center)}&type=${encodeURIComponent(visaType)}&month=${encodeURIComponent(monthKey)}`)
      .then((data) => {
        lastMonthData = data;
        buildCalendarGrid(data.days || []);
      })
      .catch(() => {
        buildCalendarGrid([]);
      })
      .finally(() => {
        maybeShowSessionExpired();
      });
  }

  function loadDaySlots(dateStr) {
    const center = centerSelect.value;
    const visaType = visaTypeSelect.value;
    slotsContainer.innerHTML = 'Loading slots...';

    apiFetch(`/api/slots/day?date=${encodeURIComponent(dateStr)}&center=${encodeURIComponent(center)}&type=${encodeURIComponent(visaType)}`)
      .then((data) => {
        const slots = data.slots || {};
        renderSlots(slots);
      })
      .catch(() => {
        slotsContainer.innerHTML = '<div class="error-text">Failed to load slots</div>';
      });
  }

  function renderSlots(slotsObj) {
    slotsContainer.innerHTML = '';

    const times = Object.keys(slotsObj).sort();
    if (times.length === 0) {
      slotsContainer.textContent = 'No time slots configured for this day.';
      return;
    }

    times.forEach((time) => {
      const status = slotsObj[time];
      const row = document.createElement('div');
      row.className = 'slot-row';
      row.dataset.slot = time;
      row.dataset.status = status;

      const timeSpan = document.createElement('span');
      timeSpan.textContent = time;

      const statusSpan = document.createElement('span');
      statusSpan.className = 'slot-status-pill';
      statusSpan.textContent = status === 'available' ? 'Available' : 'Booked';

      row.appendChild(timeSpan);
      row.appendChild(statusSpan);

      slotsContainer.appendChild(row);
    });
  }

  prevMonthBtn.addEventListener('click', () => {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    loadMonth();
  });

  nextMonthBtn.addEventListener('click', () => {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    loadMonth();
  });

  checkAppointmentsBtn.addEventListener('click', () => {
    loadMonth();
  });

  regenerateCsrfToken();
})();
