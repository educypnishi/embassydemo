(function () {
  // Get URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const selectedDate = urlParams.get('date');
  const selectedCenter = urlParams.get('center') || 'DXB';
  const selectedType = urlParams.get('type') || 'Tourist';

  // Session management
  let sessionToken = localStorage.getItem('embassySessionToken');
  let sessionStartTime = parseInt(localStorage.getItem('embassySessionStart') || '0');
  let sessionTimer = null;
  let currentSlotsData = null;
  let ajaxStageHistory = [];
  let debugModeActive = false;

  // DOM elements
  const timeRemainingSpan = document.getElementById('time-remaining');
  const backBtn = document.getElementById('back-btn');
  const selectedDateDisplay = document.getElementById('selected-date-display');
  const selectedCenterDisplay = document.getElementById('selected-center-display');
  const selectedTypeDisplay = document.getElementById('selected-type-display');
  const timeSlotsLoading = document.getElementById('time-slots-loading');
  const timeSlotsContainer = document.getElementById('time-slots-container');
  const noSlotsMessage = document.getElementById('no-slots-message');
  const summaryModal = document.getElementById('appointment-summary-modal');
  const summaryDate = document.getElementById('summary-date');
  const summaryTime = document.getElementById('summary-time');
  const summaryCenter = document.getElementById('summary-center');
  const summaryType = document.getElementById('summary-type');
  const summaryCloseBtn = document.getElementById('summary-close-btn');
  const summaryBackCalendarBtn = document.getElementById('summary-back-calendar-btn');
  const sessionExpiredPopup = document.getElementById('session-expired-popup');
  const sessionExpiredOkBtn = document.getElementById('session-expired-ok-btn');

  // Check if logged in
  if (!sessionToken || !selectedDate) {
    window.location.href = '/login';
    return;
  }

  // Display selected info
  selectedDateDisplay.textContent = selectedDate;
  selectedCenterDisplay.textContent = selectedCenter;
  selectedTypeDisplay.textContent = selectedType;

  // Session management
  function updateSessionTimer() {
    const SESSION_DURATION = 7 * 60 * 1000;
    const elapsed = Date.now() - sessionStartTime;
    const remaining = SESSION_DURATION - elapsed;

    if (remaining <= 0) {
      handleSessionExpired();
      return;
    }

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    timeRemainingSpan.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  function handleSessionExpired() {
    clearInterval(sessionTimer);
    sessionExpiredPopup.classList.remove('hidden');
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

  backBtn.addEventListener('click', () => {
    window.location.href = '/dashboard';
  });

  summaryCloseBtn.addEventListener('click', () => {
    summaryModal.classList.add('hidden');
  });

  summaryBackCalendarBtn.addEventListener('click', () => {
    window.location.href = '/dashboard';
  });

  // AJAX Stage tracker - keeps last 3 messages
  function updateAjaxStage(message) {
    const timestamp = new Date().toLocaleTimeString();
    ajaxStageHistory.push(`[${timestamp}] ${message}`);
    
    // Keep only last 3 messages
    if (ajaxStageHistory.length > 3) {
      ajaxStageHistory.shift();
    }
    
    // Update debug panel if active
    if (debugModeActive && debugSlotsCount) {
      const debugStagesDiv = document.getElementById('debug-slots-count');
      if (debugStagesDiv) {
        debugStagesDiv.innerHTML = ajaxStageHistory.join('<br>');
      }
    }
  }

  // Load time slots with auto-retry
  let retryCount = 0;
  function loadTimeSlots(isRetry = false) {
    timeSlotsLoading.classList.remove('hidden');
    timeSlotsContainer.classList.add('hidden');
    noSlotsMessage.classList.add('hidden');

    // Track AJAX stage
    updateAjaxStage('Loading time slots…');

    fetch(`/api/embassy/time-slots?date=${encodeURIComponent(selectedDate)}&center=${encodeURIComponent(selectedCenter)}&type=${encodeURIComponent(selectedType)}`, {
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
      
      updateAjaxStage('Time slot response received');
      return res.json();
    })
    .then(data => {
      timeSlotsLoading.classList.add('hidden');
      retryCount = 0; // Reset retry count on success
      
      // Store slots data for debug panel
      currentSlotsData = data;
      
      const availableCount = data.slots ? data.slots.filter(s => s.available).length : 0;
      updateAjaxStage(`Slots loaded: ${availableCount} available`);

      if (!data.slots || data.slots.length === 0) {
        noSlotsMessage.classList.remove('hidden');
        return;
      }

      renderTimeSlots(data.slots);
      timeSlotsContainer.classList.remove('hidden');
    })
    .catch(err => {
      timeSlotsLoading.classList.add('hidden');
      
      updateAjaxStage('Slots load failed: ' + err.message);
      
      if (err.message !== 'Session expired') {
        // Auto-retry once if this is the first failure
        if (!isRetry && retryCount === 0) {
          retryCount++;
          noSlotsMessage.classList.remove('hidden');
          noSlotsMessage.textContent = 'Failed to load slots. Retrying...';
          noSlotsMessage.style.color = '#f59e0b'; // Orange color for retry
          updateAjaxStage('Retrying slot load...');
          setTimeout(() => {
            loadTimeSlots(true);
          }, 1500);
        } else {
          noSlotsMessage.classList.remove('hidden');
          noSlotsMessage.textContent = 'Failed to load time slots. Please try again.';
          noSlotsMessage.style.color = '#b91c1c'; // Red color for error
        }
      }
    });
  }

  // Render time slots with embassy DOM patterns
  function renderTimeSlots(slots) {
    timeSlotsContainer.innerHTML = '';

    slots.forEach(slot => {
      if (slot.available) {
        // Embassy DOM pattern: button[data-action="select-time"]
        const button = document.createElement('button');
        button.className = 'time-slot-btn';
        button.setAttribute('data-action', 'select-time');
        button.setAttribute('data-time', slot.time);

        // Embassy DOM pattern: div.slot[data-status="available"]
        const slotDiv = document.createElement('div');
        slotDiv.className = 'slot time-slot-available';
        slotDiv.setAttribute('data-status', 'available');

        // Embassy DOM pattern: li.time-slot-available (simulate list structure)
        const listItem = document.createElement('li');
        listItem.className = 'time-slot-available';
        listItem.style.listStyle = 'none';
        listItem.textContent = slot.time;

        slotDiv.appendChild(listItem);
        button.appendChild(slotDiv);

        button.addEventListener('click', () => {
          selectTimeSlot(slot.time);
        });

        timeSlotsContainer.appendChild(button);
      } else {
        // Booked slots
        const button = document.createElement('button');
        button.className = 'time-slot-btn booked';
        button.disabled = true;

        const slotDiv = document.createElement('div');
        slotDiv.className = 'slot time-slot-booked';
        slotDiv.setAttribute('data-status', 'booked');

        const listItem = document.createElement('li');
        listItem.className = 'time-slot-booked';
        listItem.style.listStyle = 'none';
        listItem.textContent = slot.time;

        slotDiv.appendChild(listItem);
        button.appendChild(slotDiv);

        timeSlotsContainer.appendChild(button);
      }
    });
  }

  // Select time slot and show summary
  function selectTimeSlot(time) {
    summaryDate.textContent = selectedDate;
    summaryTime.textContent = time;
    summaryCenter.textContent = selectedCenter;
    summaryType.textContent = selectedType;
    summaryModal.classList.remove('hidden');
  }

  // Debug panel functionality
  const timeDebugToggle = document.getElementById('time-debug-toggle');
  const selectTimeDebug = document.getElementById('select-time-debug');
  const debugDate = document.getElementById('debug-date');
  const debugSession = document.getElementById('debug-session');
  const debugSlotsCount = document.getElementById('debug-slots-count');
  const copyTimeDebugBtn = document.getElementById('copy-time-debug-btn');
  const copySuccessMsgTime = document.getElementById('copy-success-msg-time');

  if (timeDebugToggle) {
    timeDebugToggle.addEventListener('change', () => {
      debugModeActive = timeDebugToggle.checked;
      if (timeDebugToggle.checked) {
        selectTimeDebug.classList.remove('hidden');
        updateDebugInfo();
        // Show current stage history
        if (ajaxStageHistory.length > 0 && debugSlotsCount) {
          debugSlotsCount.innerHTML = ajaxStageHistory.join('<br>');
        }
      } else {
        selectTimeDebug.classList.add('hidden');
      }
    });
  }

  function updateDebugInfo() {
    if (debugDate) debugDate.textContent = selectedDate;
    if (debugSession) {
      const tokenShort = sessionToken ? sessionToken.substring(0, 15) + '...' : 'N/A';
      debugSession.textContent = tokenShort;
    }
  }

  if (copyTimeDebugBtn) {
    copyTimeDebugBtn.addEventListener('click', () => {
      const debugText = `
=== TIME SLOT DEBUG INFO ===
Timestamp: ${new Date().toISOString()}
Selected Date: ${selectedDate}
Center: ${selectedCenter}
Visa Type: ${selectedType}
Session Token: ${sessionToken}

AJAX Load Stages:
${ajaxStageHistory.join('\n')}

Slots Data:
${JSON.stringify(currentSlotsData, null, 2)}
=========================
      `.trim();

      navigator.clipboard.writeText(debugText).then(() => {
        copySuccessMsgTime.classList.remove('hidden');
        setTimeout(() => {
          copySuccessMsgTime.classList.add('hidden');
        }, 2000);
      }).catch(err => {
        alert('Failed to copy. Error: ' + err.message);
      });
    });
  }

  // Initialize
  startSessionTimer();
  loadTimeSlots();
  updateDebugInfo();
})();
