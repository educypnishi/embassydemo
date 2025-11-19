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

  const vfsCalendar = document.getElementById('vfs-calendar');
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

  function buildCalendarGrid(daysData, options = {}) {
    const { freezeBlank } = options;
    const tbody = vfsCalendar.querySelector('tbody');
    tbody.innerHTML = '';

    if (freezeBlank) {
      // keep empty body for blank-calendar freeze
      return;
    }

    const firstDay = new Date(currentMonth.getTime());
    const startWeekday = (firstDay.getDay() + 6) % 7; // Mon=0
    const month = currentMonth.getMonth();
    const year = currentMonth.getFullYear();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const map = {};
    (daysData || []).forEach((d) => {
      const date = d.date || d.d || d.appointmentDate;
      const status =
        d.status ||
        d.st ||
        (typeof d.availability === 'boolean' ? (d.availability ? 'available' : 'na') : null) ||
        'na';
      if (!date) return;
      map[date] = status;
    });

    // total cells = 5 weeks * 7 days
    let currentCell = 0;
    for (let week = 0; week < 5; week++) {
      const tr = document.createElement('tr');
      for (let dow = 0; dow < 7; dow++) {
        const td = document.createElement('td');
        td.className = 'vfs-day-cell vfs-na';
        td.dataset.status = 'na';

        const globalIndex = week * 7 + dow;
        const dayIndex = globalIndex - startWeekday + 1;

        if (dayIndex >= 1 && dayIndex <= daysInMonth) {
          const dateObj = new Date(year, month, dayIndex);
          const iso = dateObj.toISOString().slice(0, 10);
          const status = map[iso] || 'na';
          const statusClass =
            status === 'available'
              ? 'vfs-available'
              : status === 'full'
              ? 'vfs-full'
              : status === 'holiday'
              ? 'vfs-holiday'
              : 'vfs-na';

          td.className = 'vfs-day-cell ' + statusClass;
          td.dataset.date = iso;
          td.dataset.status = status;
          td.textContent = dayIndex;
        } else {
          // empty leading/trailing cells
          td.className = 'vfs-day-cell vfs-na';
          td.textContent = '';
        }

        tr.appendChild(td);
        currentCell++;
      }
      tbody.appendChild(tr);
    }

    // DOM corruption on table cells
    setTimeout(() => {
      const cells = Array.from(tbody.querySelectorAll('.vfs-day-cell'));

      // random removal of some cells' content (but keep td)
      cells.forEach((c) => {
        if (Math.random() < 0.03) {
          c.textContent = '';
          delete c.dataset.date;
          c.dataset.status = 'na';
        }
      });

      // ghost dates rows appended
      if (Math.random() < 0.4) {
        const ghostRow = document.createElement('tr');
        for (let i = 0; i < 7; i++) {
          const ghost = document.createElement('td');
          ghost.className = 'vfs-day-cell vfs-ghost';
          const ghostIdx = i;
          const ghostDate = formatMonthKey(currentMonth) + '-0' + ghostIdx;
          ghost.dataset.date = ghostDate;
          ghost.dataset.status = 'ghost';
          ghost.textContent = 'G';
          ghostRow.appendChild(ghost);
        }
        tbody.appendChild(ghostRow);
      }

      // wrapper class mutation
      if (Math.random() < 0.6) randomizeWrapperClass();
    }, 0);
  }

  vfsCalendar.addEventListener('click', (e) => {
    if (e.target.tagName !== 'TD') return;
    const td = e.target;
    if (td.classList.contains('vfs-na')) return;
    document
      .querySelectorAll('.vfs-day-cell.selected')
      .forEach((c) => c.classList.remove('selected'));
    td.classList.add('selected');
    selectedDate = td.dataset.date;
    slotDateLabel.textContent = `Slots for ${selectedDate}`;
    loadDaySlots(selectedDate);
  });

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
