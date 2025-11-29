(function () {
  // Session and Auth
  let sessionToken = localStorage.getItem('embassySessionToken');
  let sessionStartTime = parseInt(localStorage.getItem('embassySessionStart') || '0');
  let sessionTimer = null;
  let debugMode = false;

  // DOM Elements
  const calendarWrapper = document.getElementById('embassy-calendar-wrapper');
  const calendarTable = document.getElementById('embassy-calendar');
  const calendarMonthLabel = document.getElementById('calendar-month-label');
  const calendarLoading = document.getElementById('calendar-loading');
  const prevMonthBtn = document.getElementById('prev-month-btn');
  const nextMonthBtn = document.getElementById('next-month-btn');
  const checkBtn = document.getElementById('check-appointments-btn');
  const visaTypeSelect = document.getElementById('visa-type-select');
  const centerSelect = document.getElementById('center-select');
  const timeRemainingSpan = document.getElementById('time-remaining');
  const logoutBtn = document.getElementById('logout-btn');
  const sessionExpiredPopup = document.getElementById('session-expired-popup');
  const sessionExpiredOkBtn = document.getElementById('session-expired-ok-btn');
  const debugToggle = document.getElementById('embassy-debug-toggle');
  const debugPanel = document.getElementById('embassy-debug-panel');

  // Debug elements
  const debugSessionStatus = document.getElementById('debug-session-status');
  const debugAjaxStages = document.getElementById('debug-ajax-stages');
  const debugServerJson = document.getElementById('debug-server-json');
  
  // Health monitor elements
  const healthLogin = document.getElementById('health-login');
  const healthCountdown = document.getElementById('health-countdown');
  const healthExpiry = document.getElementById('health-expiry');
  const healthAjaxCalendar = document.getElementById('health-ajax-calendar');
  const healthAjaxSlots = document.getElementById('health-ajax-slots');
  const healthDomMutation = document.getElementById('health-dom-mutation');
  const healthDelays = document.getElementById('health-delays');
  const healthNoAvail = document.getElementById('health-no-avail');

  // State
  let currentMonth = new Date();
  currentMonth.setDate(1);
  let lastServerResponse = null;
  let ajaxStageHistory = [];
  
  // Health monitoring state
  let healthStats = {
    loginEnforced: true,
    sessionCountdownActive: false,
    sessionExpired: false,
    ajaxCalendarWorking: false,
    ajaxCalendarLastLoad: null,
    ajaxSlotsWorking: false,
    ajaxSlotsLastLoad: null,
    domMutationActive: false,
    domMutationCount: 0,
    randomDelaysEnabled: true,
    lastDelayMs: 0,
    noAvailabilityTriggered: false
  };

  // Check if logged in
  if (!sessionToken) {
    window.location.href = '/login';
    return;
  }

  // Validate session with server on load
  fetch('/api/embassy/validate-session', {
    headers: { 'X-Session-Token': sessionToken }
  })
  .then(res => res.json())
  .then(data => {
    if (!data.valid) {
      localStorage.removeItem('embassySessionToken');
      localStorage.removeItem('embassySessionStart');
      window.location.href = '/login';
    }
  })
  .catch(() => {
    // If validation fails, redirect to login
    localStorage.removeItem('embassySessionToken');
    localStorage.removeItem('embassySessionStart');
    window.location.href = '/login';
  });

  // Session management
  function updateSessionTimer() {
    const SESSION_DURATION = 7 * 60 * 1000; // 7 minutes
    const elapsed = Date.now() - sessionStartTime;
    const remaining = SESSION_DURATION - elapsed;

    if (remaining <= 0) {
      handleSessionExpired();
      return;
    }

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    timeRemainingSpan.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    // Update health stats
    healthStats.sessionCountdownActive = true;

    if (debugMode) {
      const tokenDisplay = sessionToken.substring(0, 20) + '...';
      debugSessionStatus.innerHTML = `<strong>Token:</strong> ${tokenDisplay}`;
      updateHealthMonitor();
    }
  }

  function handleSessionExpired() {
    clearInterval(sessionTimer);
    sessionExpiredPopup.classList.remove('hidden');
    healthStats.sessionExpired = true;
    healthStats.sessionCountdownActive = false;
    if (debugMode) {
      debugSessionStatus.textContent = 'EXPIRED';
      updateHealthMonitor();
    }
  }

  function startSessionTimer() {
    updateSessionTimer();
    sessionTimer = setInterval(updateSessionTimer, 1000);
  }

  sessionExpiredOkBtn.addEventListener('click', () => {
    localStorage.removeItem('embassySessionToken');
    localStorage.removeItem('embassySessionStart');
    window.location.href = '/login';
  });

  logoutBtn.addEventListener('click', () => {
    fetch('/api/embassy/logout', {
      method: 'POST',
      headers: { 'X-Session-Token': sessionToken }
    }).finally(() => {
      localStorage.removeItem('embassySessionToken');
      localStorage.removeItem('embassySessionStart');
      window.location.href = '/login';
    });
  });

  // Debug toggle
  debugToggle.addEventListener('change', () => {
    debugMode = debugToggle.checked;
    if (debugMode) {
      debugPanel.classList.remove('hidden');
      updateSessionTimer();
      // Show sessionToken in debug mode
      const tokenDisplay = sessionToken.substring(0, 20) + '...';
      debugSessionStatus.innerHTML = `<strong>Token:</strong> ${tokenDisplay}<br><strong>Status:</strong> Active`;
      // Show current AJAX stage history
      if (ajaxStageHistory.length > 0 && debugAjaxStages) {
        debugAjaxStages.innerHTML = ajaxStageHistory.join('<br>');
      }
      // Initialize health monitor
      updateHealthMonitor();
    } else {
      debugPanel.classList.add('hidden');
    }
  });

  // Copy debug info button
  const copyDebugBtn = document.getElementById('copy-debug-btn');
  const copySuccessMsg = document.getElementById('copy-success-msg');
  
  copyDebugBtn.addEventListener('click', () => {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      sessionToken: sessionToken,
      sessionStatus: debugSessionStatus.textContent || debugSessionStatus.innerHTML,
      ajaxStages: ajaxStageHistory.join('\n'),
      serverJson: debugServerJson.textContent,
      currentMonth: formatDisplayMonth(currentMonth),
      selectedFilters: {
        center: centerSelect.value,
        visaType: visaTypeSelect.value
      },
      lastServerResponse: lastServerResponse
    };

    const debugText = `
=== EMBASSY HEALTH REPORT ===
Timestamp: ${debugInfo.timestamp}
Session Token: ${debugInfo.sessionToken}

HEALTH STATUS:
- Login Enforcement: ${healthStats.loginEnforced ? 'ON' : 'OFF'}
- Session Countdown: ${healthStats.sessionCountdownActive ? 'Active' : 'Inactive'}
- Auto-Expiry Triggered: ${healthStats.sessionExpired ? 'YES' : 'NO'}
- AJAX Calendar: ${healthStats.ajaxCalendarWorking ? 'Working' : 'Not triggered'}
- AJAX Calendar Last Load: ${healthStats.ajaxCalendarLastLoad ? new Date(healthStats.ajaxCalendarLastLoad).toLocaleString() : 'Never'}
- DOM Mutation: ${healthStats.domMutationActive ? 'Active' : 'Inactive'} (${healthStats.domMutationCount} mutations)
- Random Delays: ${healthStats.randomDelaysEnabled ? 'Enabled' : 'Disabled'} (Last: ${healthStats.lastDelayMs}ms)
- No-Availability Mode: ${healthStats.noAvailabilityTriggered ? 'TRIGGERED' : 'Not triggered'}

AJAX Load Stages:
${debugInfo.ajaxStages}

Selected Filters:
- Center: ${debugInfo.selectedFilters.center}
- Visa Type: ${debugInfo.selectedFilters.visaType}
- Current Month: ${debugInfo.currentMonth}

Server JSON Response:
${debugInfo.serverJson}

Full Server Response Object:
${JSON.stringify(debugInfo.lastServerResponse, null, 2)}
=========================
    `.trim();

    navigator.clipboard.writeText(debugText).then(() => {
      copySuccessMsg.classList.remove('hidden');
      setTimeout(() => {
        copySuccessMsg.classList.add('hidden');
      }, 2000);
    }).catch(err => {
      alert('Failed to copy. Please select and copy manually.');
      console.error('Copy failed:', err);
    });
  });

  // Date formatting
  function formatMonthKey(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  function formatDisplayMonth(dateObj) {
    const opts = { month: 'long', year: 'numeric' };
    return dateObj.toLocaleDateString(undefined, opts);
  }

  // Health monitor update function
  function updateHealthMonitor() {
    if (!debugMode) return;
    
    // Login Enforcement
    setHealthStatus(healthLogin, 'ON', 'status-on');
    
    // Session Countdown
    if (healthStats.sessionCountdownActive) {
      const remaining = timeRemainingSpan.textContent;
      setHealthStatus(healthCountdown, `YES (${remaining})`, 'status-working');
    } else {
      setHealthStatus(healthCountdown, 'NO', 'status-off');
    }
    
    // Auto-Expiry
    if (healthStats.sessionExpired) {
      setHealthStatus(healthExpiry, 'TRIGGERED', 'status-triggered');
    } else {
      setHealthStatus(healthExpiry, 'Ready', 'status-on');
    }
    
    // AJAX Calendar
    if (healthStats.ajaxCalendarWorking) {
      const time = healthStats.ajaxCalendarLastLoad ? new Date(healthStats.ajaxCalendarLastLoad).toLocaleTimeString() : '--';
      setHealthStatus(healthAjaxCalendar, `Active (${time})`, 'status-working');
    } else {
      setHealthStatus(healthAjaxCalendar, 'Not triggered', 'status-off');
    }
    
    // AJAX Slots (N/A on dashboard)
    setHealthStatus(healthAjaxSlots, 'N/A', 'status-off');
    
    // DOM Mutation
    if (healthStats.domMutationActive) {
      setHealthStatus(healthDomMutation, `Active (${healthStats.domMutationCount}x)`, 'status-working');
    } else {
      setHealthStatus(healthDomMutation, 'Inactive', 'status-off');
    }
    
    // Random Delays
    if (healthStats.randomDelaysEnabled) {
      setHealthStatus(healthDelays, `Enabled (${healthStats.lastDelayMs}ms)`, 'status-on');
    } else {
      setHealthStatus(healthDelays, 'Disabled', 'status-off');
    }
    
    // No-Availability Mode
    if (healthStats.noAvailabilityTriggered) {
      setHealthStatus(healthNoAvail, 'TRIGGERED', 'status-triggered');
    } else {
      setHealthStatus(healthNoAvail, 'Not triggered', 'status-off');
    }
  }
  
  function setHealthStatus(element, text, statusClass) {
    if (!element) return;
    element.textContent = text;
    element.className = 'health-value ' + statusClass;
  }

  // AJAX Stage tracker - keeps last 3 messages
  function updateAjaxStage(message) {
    const timestamp = new Date().toLocaleTimeString();
    ajaxStageHistory.push(`[${timestamp}] ${message}`);
    
    // Keep only last 3 messages
    if (ajaxStageHistory.length > 3) {
      ajaxStageHistory.shift();
    }
    
    // Update debug panel if active
    if (debugMode && debugAjaxStages) {
      debugAjaxStages.innerHTML = ajaxStageHistory.join('<br>');
    }
  }

  // Embassy-style className mutation (anti-automation)
  function mutateWrapperClass() {
    const prefixes = ['embassy-cal', 'uscis-wrapper', 'appointment-grid', 'visa-calendar'];
    const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    calendarWrapper.className = 'embassy-wrapper ' + randomPrefix + '-' + randomSuffix;
    
    // Track mutation
    healthStats.domMutationActive = true;
    healthStats.domMutationCount++;
    if (debugMode) updateHealthMonitor();
  }

  // AJAX Calendar Loader with Embassy delays
  function loadCalendar() {
    const monthKey = formatMonthKey(currentMonth);
    const center = centerSelect.value;
    const visaType = visaTypeSelect.value;

    calendarMonthLabel.textContent = formatDisplayMonth(currentMonth);

    // Show loading spinner and hide calendar
    calendarLoading.classList.remove('hidden');
    document.getElementById('appointment-calendar').classList.add('hidden');
    calendarTable.querySelector('tbody').innerHTML = '';

    // Track AJAX stage
    updateAjaxStage('Loading calendar…');

    // Mutate wrapper class for anti-automation
    mutateWrapperClass();

    const startTime = Date.now();
    
    // Track delay
    healthStats.lastDelayMs = Math.floor(Math.random() * 7000);

    fetch(`/api/embassy/calendar?month=${encodeURIComponent(monthKey)}&center=${encodeURIComponent(center)}&type=${encodeURIComponent(visaType)}`, {
      headers: { 'X-Session-Token': sessionToken }
    })
    .then(res => {
      if (res.status === 401) {
        handleSessionExpired();
        throw new Error('Session expired');
      }
      if (!res.ok) {
        throw new Error('HTTP ' + res.status);
      }
      
      updateAjaxStage('Calendar response received');
      return res.json();
    })
    .then(data => {
      const loadTime = Date.now() - startTime;
      
      updateAjaxStage(`Calendar loaded (${loadTime}ms)`);
      
      // Update health stats
      healthStats.ajaxCalendarWorking = true;
      healthStats.ajaxCalendarLastLoad = Date.now();
      healthStats.lastDelayMs = loadTime;
      healthStats.noAvailabilityTriggered = data.noAvailability || false;
      
      if (debugMode && debugServerJson) {
        debugServerJson.textContent = JSON.stringify(data, null, 2);
      }
      
      if (debugMode) updateHealthMonitor();

      lastServerResponse = data;

      // Hide loading spinner and show calendar
      calendarLoading.classList.add('hidden');
      document.getElementById('appointment-calendar').classList.remove('hidden');

      // Build calendar with embassy DOM patterns
      buildEmbassyCalendar(data.days || []);
    })
    .catch(err => {
      calendarLoading.classList.add('hidden');
      
      updateAjaxStage('Calendar load failed: ' + err.message);
      
      if (err.message !== 'Session expired') {
        document.getElementById('appointment-calendar').classList.remove('hidden');
        buildEmbassyCalendar([]);
      }
    });
  }

  // Build calendar with embassy-specific DOM patterns
  function buildEmbassyCalendar(daysData) {
    const tbody = calendarTable.querySelector('tbody');
    tbody.innerHTML = '';

    const firstDay = new Date(currentMonth.getTime());
    const startWeekday = (firstDay.getDay() + 6) % 7; // Mon=0
    const month = currentMonth.getMonth();
    const year = currentMonth.getFullYear();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Create date map
    const dateMap = {};
    (daysData || []).forEach((d) => {
      dateMap[d.date] = d;
    });

    // Build 5-week calendar
    let dayCounter = 1;
    for (let week = 0; week < 5; week++) {
      const tr = document.createElement('tr');
      
      for (let dow = 0; dow < 7; dow++) {
        const globalIndex = week * 7 + dow;
        const dayIndex = globalIndex - startWeekday + 1;

        if (dayIndex >= 1 && dayIndex <= daysInMonth) {
          const dateObj = new Date(year, month, dayIndex);
          const iso = dateObj.toISOString().slice(0, 10);
          const dayInfo = dateMap[iso] || { status: 'na', isOpen: false };

          // Embassy DOM pattern: td.Date with multiple classes
          const td = document.createElement('td');
          td.className = 'Date embassy-day-cell fc-daygrid-day';
          
          // Add embassy-specific classes and attributes
          if (dayInfo.isOpen || dayInfo.status === 'available') {
            td.classList.add('isOpen', 'open-date');
            td.setAttribute('data-day-status', 'open');
            td.setAttribute('data-status', 'available');
          } else if (dayInfo.status === 'full') {
            td.classList.add('closed-date', 'full-date');
            td.setAttribute('data-day-status', 'full');
            td.setAttribute('data-status', 'full');
          } else if (dayInfo.status === 'holiday') {
            td.classList.add('closed-date', 'holiday-date');
            td.setAttribute('data-day-status', 'holiday');
            td.setAttribute('data-status', 'holiday');
          } else {
            td.classList.add('closed-date', 'na-date');
            td.setAttribute('data-day-status', 'closed');
            td.setAttribute('data-status', 'na');
          }

          td.dataset.date = iso;
          td.textContent = dayIndex;

          // Click handler for redirect
          if (dayInfo.isOpen || dayInfo.status === 'available') {
            td.style.cursor = 'pointer';
            td.addEventListener('click', () => {
              // Embassy redirect pattern
              window.location.href = `/select-time?date=${iso}&center=${centerSelect.value}&type=${visaTypeSelect.value}`;
            });
          }

          tr.appendChild(td);
        } else {
          // Empty cell - 5% chance of random injection (anti-automation)
          const td = document.createElement('td');
          td.className = 'Date embassy-day-cell empty-cell';
          
          if (Math.random() < 0.05) {
            // Random ghost date
            const ghostDate = `${formatMonthKey(currentMonth)}-${Math.floor(Math.random() * 28) + 1}`;
            td.dataset.date = ghostDate;
            td.dataset.ghost = 'true';
            td.textContent = Math.floor(Math.random() * 28) + 1;
            td.style.opacity = '0.3';
          }
          
          tr.appendChild(td);
        }
      }
      
      tbody.appendChild(tr);
    }

    // Random className mutation after render (anti-automation)
    setTimeout(() => {
      if (Math.random() < 0.7) {
        mutateWrapperClass();
      }
    }, 100);
  }

  // Navigation
  prevMonthBtn.addEventListener('click', () => {
    currentMonth.setMonth(currentMonth.getMonth() - 1);
    loadCalendar();
  });

  nextMonthBtn.addEventListener('click', () => {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    loadCalendar();
  });

  checkBtn.addEventListener('click', () => {
    loadCalendar();
  });

  visaTypeSelect.addEventListener('change', () => {
    loadCalendar();
  });

  centerSelect.addEventListener('change', () => {
    loadCalendar();
  });

  // Initialize
  startSessionTimer();
  loadCalendar();
})();
