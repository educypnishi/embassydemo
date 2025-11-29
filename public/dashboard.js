(function () {
  // Session and Auth
  let sessionToken = localStorage.getItem('embassySessionToken');
  let sessionStartTime = parseInt(localStorage.getItem('embassySessionStart') || '0');
  let sessionTimer = null;
  let debugMode = true; // Always enabled for direct button access

  // Portal Mode System
  let activePortalMode = localStorage.getItem('portalMode') || 'us-embassy';
  const portalModeSelect = document.getElementById('portal-mode-select');
  const healthActiveMode = document.getElementById('health-active-mode');
  
  // Mode-specific DOM elements
  const ukGovForm = document.getElementById('uk-gov-form');
  const canadaQueue = document.getElementById('canada-queue');
  const australiaSessionStart = document.getElementById('australia-session-start');
  const blsJsonBanner = document.getElementById('bls-json-banner');
  const vfsIframeWrapper = document.getElementById('vfs-iframe-wrapper');
  const ukNextStepBtn = document.getElementById('uk-next-step-btn');
  const australiaStartBtn = document.getElementById('australia-start-btn');
  
  // Mode state
  let ukCurrentStep = 1;
  let ukStepStartTime = Date.now();
  let canadaQueueActive = false;
  let canadaTokenRefreshTimer = null;
  let australiaSessionEstablished = false;
  
  // Auto Mutation Engine
  let autoMutationTimer = null;
  let autoMutationEnabled = true;
  let lastMutationResult = null;
  
  // Dynamic Month Engine
  let baseMonth = new Date();
  baseMonth.setDate(1);
  baseMonth.setHours(0, 0, 0, 0);
  
  let monthBehaviorStats = {
    activeMonth: '',
    monthOffset: 0,
    behaviorType: 'HTML',
    lastLoadTime: 0,
    errors: [],
    ghostDateCount: 0,
    domMutationCount: 0,
    availableDays: 0,
    naDays: 0,
    fullDays: 0
  };
  
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
  // New 2-Tab Debug Screen Elements
  const openDebugBtn = document.getElementById('open-debug-btn');
  const debugModal = document.getElementById('embassy-debug-modal');
  const debugModalClose = document.getElementById('debug-modal-close');
  
  const debugTabs = document.querySelectorAll('.debug-tab');
  const debugTabUser = document.getElementById('debug-tab-user');
  const debugTabDeveloper = document.getElementById('debug-tab-developer');
  
  const copyUserBtn = document.getElementById('copy-user-btn');
  const copyDevBtn = document.getElementById('copy-dev-btn');
  const copyUserSuccess = document.getElementById('copy-user-success');
  const copyDevSuccess = document.getElementById('copy-dev-success');

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
    noAvailabilityTriggered: false,
    activeMode: activePortalMode,
    autoMutationActive: false,
    autoMutationLastTime: null,
    autoMutationCount: 0,
    lastMutationType: null
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
      updateDebugScreen();
    }
  }

  function handleSessionExpired() {
    clearInterval(sessionTimer);
    sessionExpiredPopup.classList.remove('hidden');
    healthStats.sessionExpired = true;
    healthStats.sessionCountdownActive = false;
    if (debugMode) {
      updateDebugScreen();
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

  // Open Debug Screen Button - direct access
  if (openDebugBtn) {
    openDebugBtn.addEventListener('click', () => {
      if (debugModal) {
        debugModal.classList.remove('hidden');
        updateDebugScreen();
      }
    });
  }
  
  // Modal close
  if (debugModalClose) {
    debugModalClose.addEventListener('click', () => {
      debugModal.classList.add('hidden');
    });
  }
  
  // Close on backdrop click
  if (debugModal) {
    debugModal.addEventListener('click', (e) => {
      if (e.target === debugModal) {
        debugModal.classList.add('hidden');
      }
    });
  }
  
  // Tab switching
  debugTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      
      // Update tab buttons
      debugTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Update tab content
      document.querySelectorAll('.debug-tab-content').forEach(content => {
        content.classList.remove('active');
      });
      document.getElementById(`debug-tab-${targetTab}`).classList.add('active');
      
      // Update content when switching tabs
      updateDebugScreen();
    });
  });
  
  // Update debug screen (both tabs)
  function updateDebugScreen() {
    if (!debugMode) return;
    
    updateUserView();
    updateDeveloperView();
  }
  
  // Update User View Tab
  function updateUserView() {
    try {
      // Session Active
      const userSession = document.getElementById('user-session');
      if (userSession) {
        userSession.textContent = sessionToken ? '✔' : '✖';
        userSession.style.color = sessionToken ? '#10b981' : '#ef4444';
      }
      
      // Login Redirect Working
      const userLogin = document.getElementById('user-login');
      if (userLogin) {
        userLogin.textContent = healthStats.loginEnforced ? '✔' : '✖';
        userLogin.style.color = healthStats.loginEnforced ? '#10b981' : '#ef4444';
      }
      
      // Session Expiry Working
      const userExpiry = document.getElementById('user-expiry');
      if (userExpiry) {
        userExpiry.textContent = healthStats.sessionCountdownActive ? '✔' : '⏳';
        userExpiry.style.color = healthStats.sessionCountdownActive ? '#10b981' : '#f59e0b';
      }
      
      // AJAX Calendar Load Working
      const userAjax = document.getElementById('user-ajax');
      if (userAjax) {
        userAjax.textContent = healthStats.ajaxCalendarWorking ? '✔' : '✖';
        userAjax.style.color = healthStats.ajaxCalendarWorking ? '#10b981' : '#6b7280';
      }
      
      // Month Behaviour Type
      const userMonthBehavior = document.getElementById('user-month-behavior');
      if (userMonthBehavior) {
        userMonthBehavior.textContent = monthBehaviorStats.behaviorType || 'HTML';
      }
      
      // Auto Slot Mutation Engine
      const userMutation = document.getElementById('user-mutation');
      if (userMutation) {
        userMutation.textContent = healthStats.autoMutationActive ? '✔' : '⏳';
        userMutation.style.color = healthStats.autoMutationActive ? '#10b981' : '#f59e0b';
      }
      
      // Ghost Dates Injected
      const hasGhost = monthBehaviorStats.ghostDateCount > 0;
      const userGhost = document.getElementById('user-ghost');
      if (userGhost) {
        userGhost.textContent = hasGhost ? `✔ (${monthBehaviorStats.ghostDateCount})` : '✖';
        userGhost.style.color = hasGhost ? '#10b981' : '#6b7280';
      }
      
      // Portal Mode Active
      const modeNames = {
        'us-embassy': 'US Embassy 🇺🇸',
        'vfs-global': 'VFS Global 🌍',
        'bls-schengen': 'BLS/Schengen 🇪🇺',
        'uk-gov': 'UK GOV 🇬🇧',
        'canada-vac': 'Canada VAC 🇨🇦',
        'australia-immi': 'Australia Immi 🇦🇺'
      };
      const userPortal = document.getElementById('user-portal');
      if (userPortal) {
        userPortal.textContent = modeNames[activePortalMode] || activePortalMode;
      }
      
      // Slot Engine Healthy
      const slotEngineHealthy = healthStats.ajaxCalendarWorking && !healthStats.sessionExpired;
      const userSlotEngine = document.getElementById('user-slot-engine');
      if (userSlotEngine) {
        userSlotEngine.textContent = slotEngineHealthy ? '✔' : '✖';
        userSlotEngine.style.color = slotEngineHealthy ? '#10b981' : '#ef4444';
      }
      
      // No-Availability Triggered
      const userNoAvail = document.getElementById('user-no-avail');
      if (userNoAvail) {
        userNoAvail.textContent = healthStats.noAvailabilityTriggered ? '✔' : '✖';
        userNoAvail.style.color = healthStats.noAvailabilityTriggered ? '#f59e0b' : '#6b7280';
      }
      
      // Random Error Mode
      const hasErrors = monthBehaviorStats.errors.length > 0;
      const userRandomError = document.getElementById('user-random-error');
      if (userRandomError) {
        userRandomError.textContent = hasErrors ? `✔ (${monthBehaviorStats.errors.join(', ')})` : '✖';
        userRandomError.style.color = hasErrors ? '#f59e0b' : '#6b7280';
      }
      
      // Queue Screen Working (Canada)
      const queueWorking = activePortalMode === 'canada-vac' && !canadaQueueActive;
      const userQueue = document.getElementById('user-queue');
      if (userQueue) {
        userQueue.textContent = activePortalMode === 'canada-vac' ? (queueWorking ? '✔' : '⏳') : 'N/A';
        userQueue.style.color = queueWorking ? '#10b981' : '#6b7280';
      }
      
      // Multi-Step Flow Working (UK GOV)
      const multiStepWorking = activePortalMode === 'uk-gov' && ukCurrentStep > 0;
      const userMultistep = document.getElementById('user-multistep');
      if (userMultistep) {
        userMultistep.textContent = activePortalMode === 'uk-gov' ? (multiStepWorking ? `✔ (Step ${ukCurrentStep})` : '⏳') : 'N/A';
        userMultistep.style.color = multiStepWorking ? '#10b981' : '#6b7280';
      }
      
      // Hidden Calendar Behaviour (Australia)
      const userHiddenCal = document.getElementById('user-hidden-cal');
      if (userHiddenCal) {
        userHiddenCal.textContent = activePortalMode === 'australia-immi' ? (australiaSessionEstablished ? '✔' : '⏳') : 'N/A';
        userHiddenCal.style.color = australiaSessionEstablished ? '#10b981' : '#6b7280';
      }
    } catch (err) {
      console.error('User view update error:', err);
    }
  }
  
  // Update Developer View Tab
  function updateDeveloperView() {
    try {
      // Session Information
      const sessionInfo = `Token: ${sessionToken ? sessionToken.substring(0, 30) + '...' : 'N/A'}\nRemaining: ${timeRemainingSpan ? timeRemainingSpan.textContent : 'N/A'}\nActive: ${sessionToken ? 'Yes' : 'No'}`;
      const devSession = document.getElementById('dev-session');
      if (devSession) devSession.textContent = sessionInfo;
      
      // AJAX Load Stages
      const devAjaxStages = document.getElementById('dev-ajax-stages');
      if (devAjaxStages) {
        devAjaxStages.innerHTML = ajaxStageHistory.length > 0 ? ajaxStageHistory.join('<br>') : 'No AJAX activity yet';
      }
      
      // Month Behaviour Engine
      const monthInfo = `Active Month: ${monthBehaviorStats.activeMonth || 'N/A'}\nOffset: +${monthBehaviorStats.monthOffset}\nBehaviour: ${monthBehaviorStats.behaviorType}\nLoad Time: ${monthBehaviorStats.lastLoadTime}ms\nErrors: ${monthBehaviorStats.errors.join(', ') || 'None'}\nGhost Dates: ${monthBehaviorStats.ghostDateCount}\nAvailability: ${monthBehaviorStats.availableDays} avail, ${monthBehaviorStats.naDays} NA, ${monthBehaviorStats.fullDays} full`;
      const devMonthBehavior = document.getElementById('dev-month-behavior');
      if (devMonthBehavior) devMonthBehavior.textContent = monthInfo;
      
      // Slot Mutation Log
      const mutationInfo = lastMutationResult ? `Last Mutation: ${new Date(lastMutationResult.timestamp).toLocaleString()}\nMode: ${lastMutationResult.mode}\nDays Changed: ${lastMutationResult.daysChanged}\nSlots Changed: ${lastMutationResult.slotsChanged}\nMutations: ${JSON.stringify(lastMutationResult.mutations, null, 2)}` : 'No mutations yet';
      const devSlotMutation = document.getElementById('dev-slot-mutation');
      if (devSlotMutation) devSlotMutation.textContent = mutationInfo;
      
      // DOM Mutation Count
      const devDomMutation = document.getElementById('dev-dom-mutation');
      if (devDomMutation) {
        devDomMutation.textContent = `Total Mutations: ${healthStats.domMutationCount}\nActive: ${healthStats.domMutationActive ? 'Yes' : 'No'}`;
      }
      
      // Network Errors
      const devNetworkErrors = document.getElementById('dev-network-errors');
      if (devNetworkErrors) {
        devNetworkErrors.textContent = monthBehaviorStats.errors.length > 0 ? monthBehaviorStats.errors.join('\n') : 'No errors';
      }
      
      // Behaviour Stack
      const stackInfo = `Portal Mode: ${activePortalMode}\nMonth Behaviour: ${monthBehaviorStats.behaviorType}\nMonth Offset: +${monthBehaviorStats.monthOffset}\nCalendar Source: ${monthBehaviorStats.behaviorType === 'JSON' ? 'JSON API' : 'HTML Calendar'}\nMode Features: ${getModeFeatures()}`;
      const devBehaviorStack = document.getElementById('dev-behavior-stack');
      if (devBehaviorStack) devBehaviorStack.textContent = stackInfo;
      
      // API JSON Preview
      const devJsonPreview = document.getElementById('dev-json-preview');
      if (devJsonPreview) {
        devJsonPreview.textContent = lastServerResponse ? JSON.stringify(lastServerResponse, null, 2) : '{}';
      }
    } catch (err) {
      console.error('Developer view update error:', err);
    }
  }
  
  function getModeFeatures() {
    const features = [];
    if (activePortalMode === 'vfs-global') features.push('2-step loading', 'Random overlays');
    if (activePortalMode === 'bls-schengen') features.push('JSON-only');
    if (activePortalMode === 'uk-gov') features.push('Multi-step form');
    if (activePortalMode === 'canada-vac') features.push('Queue system', 'Token refresh');
    if (activePortalMode === 'australia-immi') features.push('Session button');
    return features.length > 0 ? features.join(', ') : 'Standard';
  }
  
  // Copy User View
  if (copyUserBtn) {
    copyUserBtn.addEventListener('click', () => {
      const userText = `
=== EMBASSY SIMULATOR - USER STATUS REPORT ===
Generated: ${new Date().toLocaleString()}

SYSTEM STATUS:
🔐 Session Active: ${sessionToken ? '✔ YES' : '✖ NO'}
🔄 Login Redirect Working: ${healthStats.loginEnforced ? '✔ YES' : '✖ NO'}
⏱️ Session Expiry Working: ${healthStats.sessionCountdownActive ? '✔ YES' : '⏳ PENDING'}
📡 AJAX Calendar Load Working: ${healthStats.ajaxCalendarWorking ? '✔ YES' : '✖ NO'}
📅 Month Behaviour Type: ${monthBehaviorStats.behaviorType || 'HTML'}
🔄 Auto Slot Mutation Engine: ${healthStats.autoMutationActive ? '✔ RUNNING' : '⏳ WAITING'}
👻 Ghost Dates Injected: ${monthBehaviorStats.ghostDateCount > 0 ? `✔ YES (${monthBehaviorStats.ghostDateCount})` : '✖ NO'}
🌐 Portal Mode Active: ${activePortalMode.toUpperCase()}
💚 Slot Engine Healthy: ${healthStats.ajaxCalendarWorking && !healthStats.sessionExpired ? '✔ YES' : '✖ NO'}
🚫 No-Availability Triggered: ${healthStats.noAvailabilityTriggered ? '✔ YES' : '✖ NO'}
⚠️ Random Error Mode: ${monthBehaviorStats.errors.length > 0 ? `✔ YES (${monthBehaviorStats.errors.join(', ')})` : '✖ NO'}
🇨🇦 Queue Screen Working: ${activePortalMode === 'canada-vac' ? (!canadaQueueActive ? '✔ YES' : '⏳ IN QUEUE') : 'N/A'}
🇬🇧 Multi-Step Flow Working: ${activePortalMode === 'uk-gov' ? `✔ YES (Step ${ukCurrentStep})` : 'N/A'}
🇦🇺 Hidden Calendar Behaviour: ${activePortalMode === 'australia-immi' ? (australiaSessionEstablished ? '✔ YES' : '⏳ NOT STARTED') : 'N/A'}

============================================
      `.trim();
      
      navigator.clipboard.writeText(userText).then(() => {
        copyUserSuccess.classList.remove('hidden');
        setTimeout(() => copyUserSuccess.classList.add('hidden'), 2000);
      }).catch(err => console.error('Copy failed:', err));
    });
  }
  
  // Copy Developer View
  if (copyDevBtn) {
    copyDevBtn.addEventListener('click', () => {
      const devText = `
=== EMBASSY SIMULATOR - DEVELOPER DIAGNOSTICS ===
Generated: ${new Date().toLocaleString()}

🔐 SESSION INFORMATION:
${document.getElementById('dev-session').textContent}

📡 AJAX LOAD STAGES:
${ajaxStageHistory.join('\n')}

📅 MONTH BEHAVIOUR ENGINE:
${document.getElementById('dev-month-behavior').textContent}

🔄 SLOT MUTATION LOG:
${document.getElementById('dev-slot-mutation').textContent}

🎨 DOM MUTATION COUNT:
${document.getElementById('dev-dom-mutation').textContent}

⚠️ NETWORK ERRORS:
${document.getElementById('dev-network-errors').textContent}

🌐 BEHAVIOUR STACK:
${document.getElementById('dev-behavior-stack').textContent}

📊 API JSON PREVIEW:
${document.getElementById('dev-json-preview').textContent}

============================================
      `.trim();
      
      navigator.clipboard.writeText(devText).then(() => {
        copyDevSuccess.classList.remove('hidden');
        setTimeout(() => copyDevSuccess.classList.add('hidden'), 2000);
      }).catch(err => console.error('Copy failed:', err));
    });
  }

  // Old copy button code removed - now using 2-tab system copy buttons

  // ========== UNIVERSAL PORTAL MODE SYSTEM ==========
  
  // Portal Mode Switcher
  function switchPortalMode(mode) {
    activePortalMode = mode;
    localStorage.setItem('portalMode', mode);
    healthStats.activeMode = mode;
    
    // Hide all mode-specific containers
    if (ukGovForm) ukGovForm.classList.add('hidden');
    if (canadaQueue) canadaQueue.classList.add('hidden');
    if (australiaSessionStart) australiaSessionStart.classList.add('hidden');
    if (blsJsonBanner) blsJsonBanner.classList.add('hidden');
    if (vfsIframeWrapper) vfsIframeWrapper.classList.add('hidden');
    calendarWrapper.classList.remove('hidden');
    
    // Clear mode state
    ukCurrentStep = 1;
    canadaQueueActive = false;
    australiaSessionEstablished = false;
    if (canadaTokenRefreshTimer) clearInterval(canadaTokenRefreshTimer);
    
    // Apply mode-specific setup
    switch(mode) {
      case 'us-embassy':
        setupUSEmbassyMode();
        break;
      case 'vfs-global':
        setupVFSGlobalMode();
        break;
      case 'bls-schengen':
        setupBLSSchengenMode();
        break;
      case 'uk-gov':
        setupUKGovMode();
        break;
      case 'canada-vac':
        setupCanadaVACMode();
        break;
      case 'australia-immi':
        setupAustraliaImmiMode();
        break;
    }
    
    if (debugMode) updateDebugScreen();
  }
  
  // Mode Setup Functions
  function setupUSEmbassyMode() {
    // US Embassy - already implemented, no special setup needed
    loadCalendar();
  }
  
  function setupVFSGlobalMode() {
    vfsIframeWrapper.classList.remove('hidden');
    calendarWrapper.classList.add('hidden');
    
    // 2-step loading: outer → inner
    const vfsLoadingOuter = document.getElementById('vfs-loading-outer');
    const vfsInnerFrame = document.getElementById('vfs-inner-frame');
    const vfsLoadingInner = document.getElementById('vfs-loading-inner');
    
    vfsLoadingOuter.classList.remove('hidden');
    
    // Step 1: Load outer frame (1.5-2.5s)
    setTimeout(() => {
      vfsLoadingOuter.classList.add('hidden');
      vfsInnerFrame.classList.remove('hidden');
      vfsLoadingInner.classList.remove('hidden');
      
      // Step 2: Load inner frame (1-1.5s)
      setTimeout(() => {
        vfsLoadingInner.classList.add('hidden');
        vfsIframeWrapper.classList.add('hidden');
        calendarWrapper.classList.remove('hidden');
        
        // Random "Please wait..." overlay (30% chance)
        if (Math.random() < 0.3) {
          showVFSOverlay();
        }
        
        loadCalendar();
      }, 1000 + Math.random() * 500);
    }, 1500 + Math.random() * 1000);
  }
  
  function showVFSOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'vfs-please-wait-overlay';
    overlay.innerHTML = '<div class="vfs-overlay-content"><div class="vfs-spinner"></div><p>Please wait...</p></div>';
    document.body.appendChild(overlay);
    
    setTimeout(() => {
      overlay.remove();
    }, 2000 + Math.random() * 2000);
  }
  
  function setupBLSSchengenMode() {
    blsJsonBanner.classList.remove('hidden');
    loadBLSJsonCalendar();
  }
  
  function setupUKGovMode() {
    ukGovForm.classList.remove('hidden');
    calendarWrapper.classList.add('hidden');
    ukCurrentStep = 1;
    ukStepStartTime = Date.now();
    updateUKSteps();
    
    // Check step timeout every 10 seconds
    const stepTimer = setInterval(() => {
      const elapsed = Date.now() - ukStepStartTime;
      if (elapsed > 180000) { // 3 minutes
        clearInterval(stepTimer);
        handleSessionExpired();
      }
    }, 10000);
  }
  
  function updateUKSteps() {
    const steps = document.querySelectorAll('.uk-step');
    steps.forEach((step, idx) => {
      step.classList.remove('active', 'completed');
      if (idx + 1 < ukCurrentStep) step.classList.add('completed');
      if (idx + 1 === ukCurrentStep) step.classList.add('active');
    });
    
    const content = document.getElementById('uk-step-content');
    if (ukCurrentStep === 1) {
      content.innerHTML = '<p><strong>Step 1: Personal Details</strong></p><p>Please provide your information...</p><button id="uk-next-step-btn" class="btn primary">Next Step</button>';
    } else if (ukCurrentStep === 2) {
      content.innerHTML = '<p><strong>Step 2: Passport Information</strong></p><p>Enter your passport details...</p><button id="uk-next-step-btn" class="btn primary">Next Step</button>';
    } else if (ukCurrentStep === 3) {
      content.innerHTML = '<p><strong>Step 3: Confirmation</strong></p><p>Review your information...</p><button id="uk-next-step-btn" class="btn primary">Proceed to Appointments</button>';
    }
    
    document.getElementById('uk-next-step-btn').addEventListener('click', () => {
      ukCurrentStep++;
      ukStepStartTime = Date.now(); // Reset timer
      if (ukCurrentStep > 3) {
        ukGovForm.classList.add('hidden');
        calendarWrapper.classList.remove('hidden');
        loadCalendar();
      } else {
        updateUKSteps();
      }
    });
  }
  
  function setupCanadaVACMode() {
    canadaQueue.classList.remove('hidden');
    calendarWrapper.classList.add('hidden');
    canadaQueueActive = true;
    
    // Queue wait: 30-90 seconds
    const queueWait = 30 + Math.floor(Math.random() * 61);
    const queueTimeSpan = document.getElementById('queue-time');
    let remaining = queueWait;
    
    queueTimeSpan.textContent = remaining;
    
    const queueTimer = setInterval(() => {
      remaining--;
      queueTimeSpan.textContent = remaining;
      
      if (remaining <= 0) {
        clearInterval(queueTimer);
        canadaQueue.classList.add('hidden');
        calendarWrapper.classList.remove('hidden');
        canadaQueueActive = false;
        loadCalendar();
        
        // Start token refresh every 2 minutes
        canadaTokenRefreshTimer = setInterval(() => {
          updateAjaxStage('Canada: Token refreshed');
        }, 120000);
      }
    }, 1000);
  }
  
  function setupAustraliaImmiMode() {
    australiaSessionStart.classList.remove('hidden');
    calendarWrapper.classList.add('hidden');
    australiaSessionEstablished = false;
  }
  
  // Australia Start Session Button
  if (australiaStartBtn) {
    australiaStartBtn.addEventListener('click', () => {
      australiaStartBtn.disabled = true;
      australiaStartBtn.textContent = 'Establishing Session...';
      
      // Session delay: 1-2 seconds
      const delay = 1000 + Math.random() * 1000;
      
      setTimeout(() => {
        australiaSessionEstablished = true;
        australiaSessionStart.classList.add('hidden');
        calendarWrapper.classList.remove('hidden');
        loadCalendar();
      }, delay);
    });
  }
  
  // BLS JSON Calendar Loader
  function loadBLSJsonCalendar() {
    const monthKey = formatMonthKey(currentMonth);
    const center = centerSelect.value;
    const visaType = visaTypeSelect.value;
    
    calendarMonthLabel.textContent = formatDisplayMonth(currentMonth);
    calendarLoading.classList.remove('hidden');
    document.getElementById('appointment-calendar').classList.add('hidden');
    
    updateAjaxStage('Loading JSON calendar...');
    
    fetch(`/api/embassy/json-calendar?month=${encodeURIComponent(monthKey)}&center=${encodeURIComponent(center)}&type=${encodeURIComponent(visaType)}`, {
      headers: { 'X-Session-Token': sessionToken }
    })
    .then(res => res.json())
    .then(data => {
      calendarLoading.classList.add('hidden');
      document.getElementById('appointment-calendar').classList.remove('hidden');
      
      updateAjaxStage(`JSON calendar loaded: ${data.totalAvailable} dates`);
      
      if (debugMode && debugServerJson) {
        debugServerJson.textContent = JSON.stringify(data, null, 2);
      }
      
      // Render JSON dates as list
      const tbody = calendarTable.querySelector('tbody');
      tbody.innerHTML = '';
      
      if (data.availableDates && data.availableDates.length > 0) {
        data.availableDates.forEach(dateInfo => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td colspan="7" class="bls-json-date" data-date="${dateInfo.date}">
              <strong>${dateInfo.date}</strong> (${dateInfo.dayOfWeek}) - ${dateInfo.slotsAvailable} slots available
            </td>
          `;
          tr.style.cursor = 'pointer';
          tr.addEventListener('click', () => {
            window.location.href = `/select-time?date=${dateInfo.date}&center=${center}&type=${visaType}`;
          });
          tbody.appendChild(tr);
        });
      } else {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="7" style="text-align:center; color:#6b7280;">No appointments available</td>';
        tbody.appendChild(tr);
      }
    })
    .catch(err => {
      calendarLoading.classList.add('hidden');
      updateAjaxStage('JSON calendar load failed');
    });
  }
  
  // Portal Mode Select Event
  if (portalModeSelect) {
    portalModeSelect.value = activePortalMode;
    portalModeSelect.addEventListener('change', (e) => {
      switchPortalMode(e.target.value);
    });
  }
  
  // ========== AUTO SLOT MUTATION ENGINE ==========
  
  function canRunAutoMutation() {
    // Check mode-specific conditions
    if (activePortalMode === 'uk-gov') {
      // UK GOV: Only after step 3 completion
      return ukCurrentStep > 3;
    }
    if (activePortalMode === 'canada-vac') {
      // Canada: Only after queue
      return !canadaQueueActive;
    }
    if (activePortalMode === 'australia-immi') {
      // Australia: Only after session established
      return australiaSessionEstablished;
    }
    // US Embassy, VFS, BLS: Always allowed
    return true;
  }
  
  function runAutoMutation() {
    if (!autoMutationEnabled || !canRunAutoMutation()) {
      return;
    }
    
    updateAjaxStage('Auto-mutation triggered...');
    
    fetch('/api/embassy/auto-mutate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Token': sessionToken
      },
      body: JSON.stringify({ mode: activePortalMode })
    })
    .then(res => res.json())
    .then(result => {
      lastMutationResult = result;
      
      if (result.mutations && result.mutations.length > 0) {
        healthStats.autoMutationActive = true;
        healthStats.autoMutationLastTime = Date.now();
        healthStats.autoMutationCount++;
        healthStats.lastMutationType = result.mutations[0].type;
        
        // Log mutation in AJAX stages
        const mutation = result.mutations[0];
        updateAjaxStage(`🔄 ${mutation.type}: ${mutation.date} (${mutation.count} slots)`);
        
        if (debugMode) updateDebugScreen();
        
        // Auto-refresh calendar after mutation
        setTimeout(() => {
          if (activePortalMode === 'bls-schengen') {
            loadBLSJsonCalendar();
          } else {
            loadCalendar();
          }
        }, 500);
      }
    })
    .catch(err => {
      console.error('Auto-mutation failed:', err);
    });
  }
  
  function startAutoMutationEngine() {
    if (autoMutationTimer) {
      clearInterval(autoMutationTimer);
    }
    
    // Run every 30-60 seconds
    const runMutation = () => {
      runAutoMutation();
      
      // Schedule next mutation with random delay
      const nextDelay = 30000 + Math.random() * 30000; // 30-60 seconds
      autoMutationTimer = setTimeout(runMutation, nextDelay);
    };
    
    // Start first mutation after initial delay
    const initialDelay = 15000 + Math.random() * 15000; // 15-30 seconds
    autoMutationTimer = setTimeout(runMutation, initialDelay);
  }
  
  function stopAutoMutationEngine() {
    if (autoMutationTimer) {
      clearTimeout(autoMutationTimer);
      autoMutationTimer = null;
    }
  }
  
  // ========== DYNAMIC MONTH ENGINE ==========
  
  function getMonthOffset(monthDate) {
    // Calculate months difference from base month
    const yearDiff = monthDate.getFullYear() - baseMonth.getFullYear();
    const monthDiff = monthDate.getMonth() - baseMonth.getMonth();
    return yearDiff * 12 + monthDiff;
  }
  
  function getMonthBehavior(offset) {
    const behaviors = {
      0: 'HTML',           // Current month: Standard HTML
      1: 'JSON',           // +1: JSON-only
      2: 'AJAX-Delayed',   // +2: AJAX delayed 1-3s
      3: 'No-Availability', // +3: All NA
      4: 'Full-Blocked',   // +4: All Full
      5: 'Random'          // +5: Random behaviors
    };
    
    // For months beyond +5, cycle through behaviors
    const normalizedOffset = offset < 0 ? 0 : offset % 6;
    return behaviors[normalizedOffset] || 'HTML';
  }
  
  function updateMonthBehaviorStats(monthKey, behavior, loadTime) {
    monthBehaviorStats.activeMonth = monthKey;
    monthBehaviorStats.behaviorType = behavior;
    monthBehaviorStats.lastLoadTime = loadTime;
    
    if (debugMode) {
      document.getElementById('month-active').textContent = monthKey;
      document.getElementById('month-behavior-type').textContent = behavior;
      document.getElementById('month-load-time').textContent = loadTime;
      document.getElementById('month-errors').textContent = 
        monthBehaviorStats.errors.length > 0 ? monthBehaviorStats.errors.join(', ') : 'None';
      document.getElementById('month-ghost').textContent = monthBehaviorStats.ghostDateCount;
      document.getElementById('month-mutations').textContent = monthBehaviorStats.domMutationCount;
      document.getElementById('month-availability').textContent = 
        `${monthBehaviorStats.availableDays} avail, ${monthBehaviorStats.naDays} NA, ${monthBehaviorStats.fullDays} full`;
    }
  }
  
  function resetMonthBehaviorStats() {
    monthBehaviorStats.errors = [];
    monthBehaviorStats.ghostDateCount = 0;
    monthBehaviorStats.domMutationCount = 0;
    monthBehaviorStats.availableDays = 0;
    monthBehaviorStats.naDays = 0;
    monthBehaviorStats.fullDays = 0;
  }
  
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

  // AJAX Stage tracker - keeps last 3 messages
  function updateAjaxStage(message) {
    const timestamp = new Date().toLocaleTimeString();
    ajaxStageHistory.push(`[${timestamp}] ${message}`);
    
    // Keep only last 3 messages
    if (ajaxStageHistory.length > 3) {
      ajaxStageHistory.shift();
    }
    
    // Update debug screen if active
    if (debugMode) {
      updateDebugScreen();
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
    if (debugMode) updateDebugScreen();
  }

  // AJAX Calendar Loader with Embassy delays + Dynamic Month Engine
  function loadCalendar() {
    const monthKey = formatMonthKey(currentMonth);
    const center = centerSelect.value;
    const visaType = visaTypeSelect.value;

    calendarMonthLabel.textContent = formatDisplayMonth(currentMonth);
    
    // Dynamic Month Engine: Get behavior for this month
    const monthOffset = getMonthOffset(currentMonth);
    monthBehaviorStats.monthOffset = monthOffset;
    const behavior = getMonthBehavior(monthOffset);
    
    resetMonthBehaviorStats();

    // Show loading spinner and hide calendar
    calendarLoading.classList.remove('hidden');
    document.getElementById('appointment-calendar').classList.add('hidden');
    calendarTable.querySelector('tbody').innerHTML = '';

    // Track AJAX stage
    updateAjaxStage(`Loading calendar (Month +${monthOffset}: ${behavior})…`);

    // Mutate wrapper class for anti-automation
    mutateWrapperClass();

    const startTime = Date.now();
    
    // Apply behavior-specific loading
    switch(behavior) {
      case 'JSON':
        loadMonthAsJSON(monthKey, center, visaType, startTime);
        return;
      case 'AJAX-Delayed':
        loadMonthDelayed(monthKey, center, visaType, startTime);
        return;
      case 'No-Availability':
        loadMonthNoAvailability(monthKey, center, visaType, startTime);
        return;
      case 'Full-Blocked':
        loadMonthFullBlocked(monthKey, center, visaType, startTime);
        return;
      case 'Random':
        loadMonthRandom(monthKey, center, visaType, startTime);
        return;
      default:
        // HTML - standard loading
        loadMonthHTML(monthKey, center, visaType, startTime);
    }
  }
  
  // Month +0: Standard HTML calendar
  function loadMonthHTML(monthKey, center, visaType, startTime) {
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
      
      if (debugMode) {
        updateDebugScreen();
      }

      lastServerResponse = data;

      // Hide loading spinner and show calendar
      calendarLoading.classList.add('hidden');
      document.getElementById('appointment-calendar').classList.remove('hidden');

      // Build calendar with embassy DOM patterns
      buildEmbassyCalendar(data.days || []);
      
      // Update month behavior stats
      updateMonthBehaviorStats(formatMonthKey(currentMonth), 'HTML', loadTime);
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
  
  // Month +1: JSON-only calendar
  function loadMonthAsJSON(monthKey, center, visaType, startTime) {
    fetch(`/api/embassy/json-calendar?month=${encodeURIComponent(monthKey)}&center=${encodeURIComponent(center)}&type=${encodeURIComponent(visaType)}`, {
      headers: { 'X-Session-Token': sessionToken }
    })
    .then(res => res.json())
    .then(data => {
      const loadTime = Date.now() - startTime;
      calendarLoading.classList.add('hidden');
      document.getElementById('appointment-calendar').classList.remove('hidden');
      
      updateAjaxStage(`JSON calendar loaded (${loadTime}ms)`);
      
      // Render as JSON list
      const tbody = calendarTable.querySelector('tbody');
      tbody.innerHTML = '';
      
      if (data.availableDates && data.availableDates.length > 0) {
        data.availableDates.forEach(dateInfo => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td colspan="7" class="bls-json-date" data-date="${dateInfo.date}">
              <strong>${dateInfo.date}</strong> (${dateInfo.dayOfWeek}) - ${dateInfo.slotsAvailable} slots available
            </td>
          `;
          tr.style.cursor = 'pointer';
          tr.addEventListener('click', () => {
            window.location.href = `/select-time?date=${dateInfo.date}&center=${center}&type=${visaType}`;
          });
          tbody.appendChild(tr);
        });
        monthBehaviorStats.availableDays = data.availableDates.length;
      } else {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="7" style="text-align:center; color:#6b7280;">No appointments available</td>';
        tbody.appendChild(tr);
      }
      
      updateMonthBehaviorStats(monthKey, 'JSON', loadTime);
    })
    .catch(err => {
      calendarLoading.classList.add('hidden');
      updateAjaxStage('JSON load failed');
      monthBehaviorStats.errors.push('JSON-Load-Failed');
      updateMonthBehaviorStats(monthKey, 'JSON', Date.now() - startTime);
    });
  }
  
  // Month +2: AJAX-Delayed calendar (1-3s delay, 20% slow)
  function loadMonthDelayed(monthKey, center, visaType, startTime) {
    const baseDelay = 1000 + Math.random() * 2000; // 1-3s
    const slowResponse = Math.random() < 0.2; // 20% chance
    const extraDelay = slowResponse ? 3000 + Math.random() * 2000 : 0; // +3-5s
    
    setTimeout(() => {
      fetch(`/api/embassy/calendar?month=${encodeURIComponent(monthKey)}&center=${encodeURIComponent(center)}&type=${encodeURIComponent(visaType)}`, {
        headers: { 'X-Session-Token': sessionToken }
      })
      .then(res => res.json())
      .then(data => {
        const loadTime = Date.now() - startTime;
        calendarLoading.classList.add('hidden');
        document.getElementById('appointment-calendar').classList.remove('hidden');
        
        updateAjaxStage(`Delayed calendar loaded (${loadTime}ms)${slowResponse ? ' [SLOW]' : ''}`);
        buildEmbassyCalendar(data.days || []);
        
        if (slowResponse) {
          monthBehaviorStats.errors.push('Slow-Response');
        }
        
        updateMonthBehaviorStats(monthKey, 'AJAX-Delayed', loadTime);
      });
    }, baseDelay + extraDelay);
  }
  
  // Month +3: No-Availability (all days NA)
  function loadMonthNoAvailability(monthKey, center, visaType, startTime) {
    setTimeout(() => {
      const loadTime = Date.now() - startTime;
      calendarLoading.classList.add('hidden');
      document.getElementById('appointment-calendar').classList.remove('hidden');
      
      updateAjaxStage('No-Availability month loaded');
      
      // Build calendar with all days NA
      buildEmbassyCalendar([]);
      monthBehaviorStats.naDays = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
      
      updateMonthBehaviorStats(monthKey, 'No-Availability', loadTime);
    }, 500);
  }
  
  // Month +4: Full-Blocked (all days FULL)
  function loadMonthFullBlocked(monthKey, center, visaType, startTime) {
    setTimeout(() => {
      const loadTime = Date.now() - startTime;
      calendarLoading.classList.add('hidden');
      document.getElementById('appointment-calendar').classList.remove('hidden');
      
      updateAjaxStage('Full-Blocked month loaded');
      
      // Get all days in month
      const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
      const fullDays = [];
      
      for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
        const iso = dateObj.toISOString().slice(0, 10);
        fullDays.push({ date: iso, status: 'full', isOpen: false });
      }
      
      buildEmbassyCalendar(fullDays);
      monthBehaviorStats.fullDays = daysInMonth;
      
      updateMonthBehaviorStats(monthKey, 'Full-Blocked', loadTime);
    }, 500);
  }
  
  // Month +5: Random Behaviour
  function loadMonthRandom(monthKey, center, visaType, startTime) {
    const rand = Math.random();
    
    if (rand < 0.1) {
      // 10% 403 Forbidden
      setTimeout(() => {
        calendarLoading.classList.add('hidden');
        updateAjaxStage('403 Forbidden');
        monthBehaviorStats.errors.push('403-Forbidden');
        document.getElementById('appointment-calendar').classList.remove('hidden');
        buildEmbassyCalendar([]);
        updateMonthBehaviorStats(monthKey, 'Random (403)', Date.now() - startTime);
      }, 500);
    } else if (rand < 0.2) {
      // 10% 503 Service Unavailable
      setTimeout(() => {
        calendarLoading.classList.add('hidden');
        updateAjaxStage('503 Service Unavailable');
        monthBehaviorStats.errors.push('503-Service-Unavailable');
        document.getElementById('appointment-calendar').classList.remove('hidden');
        buildEmbassyCalendar([]);
        updateMonthBehaviorStats(monthKey, 'Random (503)', Date.now() - startTime);
      }, 500);
    } else if (rand < 0.4) {
      // 20% Session Required (redirect)
      handleSessionExpired();
      monthBehaviorStats.errors.push('Session-Required');
      updateMonthBehaviorStats(monthKey, 'Random (Session)', Date.now() - startTime);
    } else if (rand < 0.6) {
      // 20% Ghost dates injected
      loadMonthHTML(monthKey, center, visaType, startTime);
      // Inject ghost dates after load
      setTimeout(() => {
        injectGhostDates();
        monthBehaviorStats.ghostDateCount = Math.floor(Math.random() * 5) + 2;
        updateMonthBehaviorStats(monthKey, 'Random (Ghost)', Date.now() - startTime);
      }, 1000);
    } else if (rand < 0.8) {
      // 20% Mixed HTML+JSON hybrid
      loadMonthHTML(monthKey, center, visaType, startTime);
      updateMonthBehaviorStats(monthKey, 'Random (Hybrid)', Date.now() - startTime);
    } else {
      // 20% VFS-style cells
      loadMonthHTML(monthKey, center, visaType, startTime);
      updateMonthBehaviorStats(monthKey, 'Random (VFS-Style)', Date.now() - startTime);
    }
  }
  
  function injectGhostDates() {
    const tbody = calendarTable.querySelector('tbody');
    const rows = tbody.querySelectorAll('tr');
    
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      cells.forEach(cell => {
        if (Math.random() < 0.15 && cell.textContent) {
          cell.style.opacity = '0.4';
          cell.style.pointerEvents = 'none';
          cell.classList.add('ghost-date');
        }
      });
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

    // Create date map and track availability
    const dateMap = {};
    let availCount = 0, naCount = 0, fullCount = 0;
    
    (daysData || []).forEach((d) => {
      dateMap[d.date] = d;
      if (d.status === 'available' || d.isOpen) {
        availCount++;
      } else if (d.status === 'full') {
        fullCount++;
      } else {
        naCount++;
      }
    });
    
    // For empty data, count all days as NA
    if (!daysData || daysData.length === 0) {
      naCount = daysInMonth;
    }
    
    // Update month behavior stats
    monthBehaviorStats.availableDays = availCount;
    monthBehaviorStats.naDays = naCount;
    monthBehaviorStats.fullDays = fullCount;

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

          // Mode-specific DOM patterns
          const td = document.createElement('td');
          
          // Base classes (US Embassy / default)
          td.className = 'Date embassy-day-cell fc-daygrid-day';
          
          // VFS Global Mode: Add VFS-specific classes
          if (activePortalMode === 'vfs-global') {
            td.classList.add('vfs-day-cell');
          }
          
          // Add status-specific classes and attributes
          if (dayInfo.isOpen || dayInfo.status === 'available') {
            td.classList.add('isOpen', 'open-date');
            if (activePortalMode === 'vfs-global') {
              td.classList.add('vfs-available');
            }
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
    if (activePortalMode === 'bls-schengen') {
      loadBLSJsonCalendar();
    } else {
      loadCalendar();
    }
  });

  nextMonthBtn.addEventListener('click', () => {
    currentMonth.setMonth(currentMonth.getMonth() + 1);
    if (activePortalMode === 'bls-schengen') {
      loadBLSJsonCalendar();
    } else {
      loadCalendar();
    }
  });

  checkBtn.addEventListener('click', () => {
    if (activePortalMode === 'bls-schengen') {
      loadBLSJsonCalendar();
    } else {
      loadCalendar();
    }
  });

  visaTypeSelect.addEventListener('change', () => {
    if (activePortalMode === 'bls-schengen') {
      loadBLSJsonCalendar();
    } else {
      loadCalendar();
    }
  });

  centerSelect.addEventListener('change', () => {
    if (activePortalMode === 'bls-schengen') {
      loadBLSJsonCalendar();
    } else {
      loadCalendar();
    }
  });

  // Initialize
  startSessionTimer();
  switchPortalMode(activePortalMode); // Initialize with saved mode
  startAutoMutationEngine(); // Start auto-mutation engine
})();
