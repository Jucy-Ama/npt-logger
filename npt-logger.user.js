// ==UserScript==
// @name         NPT Logger - AST Salesforce Helper
// @namespace    https://amazon.com/ast-npt-logger
// @version      1.2.4
// @description  Extract meetings from Amazon Calendar, export to Excel/CSV, and auto-log NPT to Salesforce
// @match        https://meetings.amazon.com/*
// @match        https://ams-amazon.lightning.force.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_openInTab
// @updateURL    https://github.com/Jucy-Ama/npt-logger/raw/refs/heads/main/npt-logger.user.js
// @downloadURL  https://github.com/Jucy-Ama/npt-logger/raw/refs/heads/main/npt-logger.user.js
// ==/UserScript==

(function() {
  'use strict';

  console.log('[NPT] Script loaded on', window.location.href);

  const SF_NPT_NEW_URL = 'https://ams-amazon.lightning.force.com/lightning/o/Ads_Success__c/new?nooverride=1&useRecordTypeCheck=1&navigationLocation=LIST_VIEW&recordTypeId=012at000000p7yjAAA';

  const ACTIVITY_TYPES = {
    'Meeting': ['1x1 with Manager', 'Team Meeting', 'Daily Huddle', 'Ad Hoc Meeting'],
    'Training and Development': ['Product Refresher', 'Process Refresher', 'New Feature / Product Launch', 'New Process SOP', 'Amazon Mandatory Training', 'Upskill-Online Training', 'Trainer', 'Mentor', 'Others'],
    'SME Activities': ['Goal Planning & Strategy', 'Program Planning & Strategy', 'Internal Team Report', 'Ad Hoc Report'],
    'Operations Deep Dive': ['WBR Call Out', 'Goal Dive Deep', 'Program Dive Deep', 'Ad Hoc Dive Deep'],
    'System Issues': ['Laptop Issue (with IT)', 'Server Issue/System Downtime', 'ATC Issue', 'System Updates'],
    'Others': []
  };

  const EXCLUDE_KEYWORDS = ['OOTO', 'OOO', 'Out of Office'];

  const AUTO_MATCH_RULES = [
    { keywords: ['wbr', 'office hour'], activityType: 'Meeting', subActivity: 'Team Meeting' },
    { keywords: ['1:1', '1on1', '1-on-1', '1 on 1'], activityType: 'Meeting', subActivity: '1x1 with Manager' },
    { keywords: ['huddle', 'standup', 'stand-up'], activityType: 'Meeting', subActivity: 'Daily Huddle' },
    { keywords: ['training', 'refresher'], activityType: 'Training and Development', subActivity: 'Product Refresher' },
    { keywords: ['deep dive', 'dive deep'], activityType: 'Operations Deep Dive', subActivity: 'Ad Hoc Dive Deep' },
  ];

  if (window.location.href.includes('meetings.amazon.com')) {
    setTimeout(createNPTButton, 2000);
  }
  if (window.location.href.includes('ams-amazon.lightning.force.com')) {
    setTimeout(initSalesforcePage, 3000);
  }

  function createNPTButton() {
    console.log('[NPT] Creating NPT Log button');
    if (document.getElementById('npt-log-btn')) {
      console.log('[NPT] Button already exists');
      return;
    }
    const btn = document.createElement('button');
    btn.id = 'npt-log-btn';
    btn.textContent = 'NPT Log';
    btn.style.cssText = 'position:fixed;top:12px;right:20px;z-index:99998;background:#7c3aed;color:white;border:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:bold;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
    btn.addEventListener('click', () => {
      console.log('[NPT] NPT Log button clicked');
      try {
        let panel = document.getElementById('npt-panel');
        if (panel) {
          console.log('[NPT] Panel exists, toggling');
          panel.style.display = (panel.style.display === 'none') ? 'flex' : 'none';
        } else {
          console.log('[NPT] Creating new panel');
          createFloatingPanel();
        }
      } catch (err) {
        console.error('[NPT] Error in button click:', err);
        alert('NPT Logger error: ' + err.message + '\n\nCheck F12 Console for details.');
      }
    });
    document.body.appendChild(btn);
    console.log('[NPT] Button added to page');
  }

  function shouldExclude(subject) {
    return EXCLUDE_KEYWORDS.some(k => subject.toUpperCase().includes(k.toUpperCase()));
  }

  function autoMatch(subject) {
    const lower = subject.toLowerCase();
    for (const rule of AUTO_MATCH_RULES) {
      for (const keyword of rule.keywords) {
        if (lower.includes(keyword.toLowerCase())) {
          return { activityType: rule.activityType, subActivity: rule.subActivity };
        }
      }
    }
    return { activityType: '', subActivity: '' };
  }

  function calcDuration(el) {
    try {
      const tile = el.closest('[mdn-tile-children]');
      if (tile && tile.parentElement) {
        const height = tile.parentElement.offsetHeight;
        return Math.round(height * 30 / 50);
      }
    } catch (e) {}
    return 60;
  }

  function extractMeetings() {
    const meetings = [];
    const subjectElements = document.querySelectorAll('h2.css-18zrg3p');
    subjectElements.forEach((subjectEl) => {
      const subject = subjectEl.getAttribute('title') || subjectEl.textContent.trim();
      if (shouldExclude(subject)) return;
      const duration = calcDuration(subjectEl);
      let activityDate = '';
      const card = subjectEl.closest('.css-1mpe07y');
      if (card) {
        const pWithId = card.querySelector('p[id]');
        if (pWithId) {
          const parts = pWithId.id.split('-');
          if (parts.length >= 3) {
            activityDate = `${parts[0]}-${parseInt(parts[1])}-${parseInt(parts[2])}`;
          }
        }
      }
      const matched = autoMatch(subject);
      meetings.push({
        subject, date: activityDate, duration: String(duration),
        activityType: matched.activityType, subActivity: matched.subActivity
      });
    });
    return meetings;
  }

  function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatTimestamp(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${y}${m}${day}_${h}${mi}`;
  }

  function getSaturdayOfWeek(meetings) {
    if (meetings && meetings.length > 0) {
      const dates = meetings.map(m => m.date).filter(d => d).map(d => new Date(d));
      if (dates.length > 0) {
        const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
        const day = maxDate.getDay();
        const diff = 6 - day;
        maxDate.setDate(maxDate.getDate() + diff);
        return formatDate(maxDate);
      }
    }
    const today = new Date();
    const day = today.getDay();
    const diff = 6 - day;
    today.setDate(today.getDate() + diff);
    return formatDate(today);
  }

  function exportToExcel() {
    console.log('[NPT Export] Clicked');
    const list = JSON.parse(GM_getValue('meetingsList', '[]'));
    if (list.length === 0) {
      alert('No meetings in list. Please "Extract from Calendar" first.');
      return;
    }
    const selected = [];
    list.forEach((m, i) => {
      const cb = document.getElementById('npt-check-' + i);
      if (!cb || !cb.checked) return;
      const actEl = document.getElementById('npt-act-' + i);
      const subEl = document.getElementById('npt-sub-' + i);
      const durEl = document.getElementById('npt-dur-' + i);
      selected.push({
        subject: m.subject,
        date: m.date,
        duration: (durEl && durEl.value) || m.duration || '60',
        activityType: (actEl && actEl.value) || m.activityType || '',
        subActivity: (subEl && subEl.value) || m.subActivity || ''
      });
    });

    if (selected.length === 0) {
      alert('⚠️ No meetings selected!\n\nPlease check the checkboxes next to meetings, or click "Select All".');
      return;
    }

    let login = GM_getValue('userLogin', '');
    if (!login) {
      const loginInput = document.getElementById('npt-login');
      if (loginInput) login = loginInput.value.trim();
    }
    if (!login) {
      login = prompt('Please enter your login/alias:', '');
      if (!login) { alert('Login required.'); return; }
      login = login.trim();
      GM_setValue('userLogin', login);
    }

    const saturday = getSaturdayOfWeek(selected);
    const timestamp = formatTimestamp(new Date());
    const filename = 'NPT_raw_' + login + '_' + saturday + '_' + timestamp + '.csv';

    const header = ['Login', 'Date', 'Subject', 'Activity Type', 'Sub Activity', 'Duration (min)'];
    const rows = selected.map(s => [login, s.date, s.subject, s.activityType, s.subActivity, s.duration]);

    const csvContent = [header, ...rows]
      .map(row => row.map(cell => {
        const val = String(cell == null ? '' : cell);
        if (/[",\n\r]/.test(val)) return '"' + val.replace(/"/g, '""') + '"';
        return val;
      }).join(','))
      .join('\r\n');

    const bom = '\uFEFF';
    const finalContent = bom + csvContent;

    let success = false;
    try {
      const blob = new Blob([finalContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try { document.body.removeChild(a); } catch(e) {}
        try { URL.revokeObjectURL(url); } catch(e) {}
      }, 100);
      success = true;
    } catch (err) {
      console.error('[NPT Export] Blob failed:', err);
    }

    if (!success) {
      try {
        const dataUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(finalContent);
        const a = document.createElement('a');
        a.href = dataUri;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { try { document.body.removeChild(a); } catch(e) {} }, 100);
        success = true;
      } catch (err) {
        console.error('[NPT Export] Data URI failed:', err);
      }
    }

    if (success) {
      alert('✓ Exported ' + selected.length + ' rows\nFile: ' + filename + '\n\nCheck your Downloads folder.');
    } else {
      alert('❌ Export failed. Check F12 Console.');
    }
  }

  function clearAllData() {
    const list = JSON.parse(GM_getValue('meetingsList', '[]'));
    const logged = JSON.parse(GM_getValue('loggedMeetings', '[]'));
    const queue = JSON.parse(GM_getValue('sfQueue', '[]'));

    const msg = '⚠️ This will clear all local data:\n\n' +
      '• ' + list.length + ' meetings in list\n' +
      '• ' + logged.length + ' logged history\n' +
      '• ' + queue.length + ' pending queue\n\n' +
      'Settings (Login/Region/Team) will be KEPT.\n\nContinue?';

    if (!confirm(msg)) return;

    GM_setValue('meetingsList', '[]');
    GM_setValue('loggedMeetings', '[]');
    GM_setValue('sfQueue', '[]');
    renderMeetingsList();
    alert('✓ All local data cleared.');
  }

  function toggleSelectAll(checked) {
    const list = JSON.parse(GM_getValue('meetingsList', '[]'));
    list.forEach((m, i) => {
      const cb = document.getElementById('npt-check-' + i);
      if (cb) cb.checked = checked;
    });
  }

  function createFloatingPanel() {
    console.log('[NPT] createFloatingPanel start');

    // Inject styles once
    if (!document.getElementById('npt-styles')) {
      const style = document.createElement('style');
      style.id = 'npt-styles';
      style.textContent = `
        #npt-panel {
          position: fixed; top: 60px; right: 10px;
          width: 380px; height: 85vh;
          background: #f8f7ff; border: 2px solid #7c3aed;
          border-radius: 12px; z-index: 99999;
          font-family: Arial, sans-serif; font-size: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.2);
          display: flex; flex-direction: column;
          overflow: hidden;
        }
        #npt-panel .npt-header {
          background: #7c3aed; color: white; padding: 12px;
          border-radius: 10px 10px 0 0;
          display: flex; justify-content: space-between; align-items: center;
          flex-shrink: 0;
        }
        #npt-panel .npt-header h3 { margin: 0; font-size: 14px; }
        #npt-panel .npt-scroll { flex: 1; overflow-y: auto; padding: 10px; }
        #npt-panel .npt-footer {
          flex-shrink: 0; padding: 10px; background: #ede9fe;
          border-top: 2px solid #c4b5fd;
          border-radius: 0 0 10px 10px;
        }
        #npt-panel .npt-section {
          background: white; border-radius: 8px;
          padding: 10px; margin-bottom: 8px;
        }
        #npt-panel .npt-section h4 {
          margin: 0 0 8px 0; color: #7c3aed; font-size: 12px;
          display: flex; justify-content: space-between; align-items: center;
        }
        #npt-panel select, #npt-panel input[type="text"], #npt-panel input[type="number"] {
          width: 100%; padding: 4px 6px;
          border: 1px solid #ddd; border-radius: 4px;
          font-size: 11px; margin-bottom: 4px; box-sizing: border-box;
        }
        #npt-panel .btn {
          display: block; width: 100%; padding: 8px;
          border: none; border-radius: 6px;
          font-size: 12px; font-weight: bold; cursor: pointer;
          margin-top: 6px;
        }
        #npt-panel .btn-primary { background: #7c3aed; color: white; }
        #npt-panel .btn-secondary { background: #e8d5f5; color: #7c3aed; }
        #npt-panel .btn-export { background: #16a34a; color: white; }
        #npt-panel .btn-danger { background: #dc2626; color: white; }
        #npt-panel .btn-mini {
          display: inline-block; width: auto; padding: 3px 8px;
          font-size: 10px; margin: 0 2px 0 0;
        }
        #npt-panel .select-controls { display: flex; gap: 4px; margin-bottom: 6px; }
        #npt-panel .meeting-card {
          background: #faf8ff; border: 1px solid #e8d5f5;
          border-radius: 6px; padding: 8px; margin-bottom: 6px;
        }
        #npt-panel .meeting-card.logged { background: #e8f5e9; border-color: #4caf50; opacity: 0.7; }
        #npt-panel .meeting-card.manual { border-left: 3px solid #7c3aed; }
        #npt-panel .meeting-subject { font-weight: bold; font-size: 11px; margin-bottom: 3px; word-wrap: break-word; }
        #npt-panel .meeting-meta { font-size: 10px; color: #888; margin-bottom: 4px; }
        #npt-panel .badge { display: inline-block; font-size: 9px; padding: 1px 5px; border-radius: 8px; color: white; margin-left: 4px; }
        #npt-panel .badge-logged { background: #4caf50; }
        #npt-panel .badge-manual { background: #7c3aed; }
        #npt-panel .row { display: flex; gap: 4px; align-items: center; margin-bottom: 3px; }
        #npt-panel .row label { font-size: 10px; white-space: nowrap; }
        #npt-panel .row input[type="number"] { width: 50px; }
        #npt-panel .toggle-btn { background: none; border: none; color: white; font-size: 18px; cursor: pointer; }
        #npt-panel .hidden { display: none !important; }
        #npt-panel .info-tip {
          background: #fff3cd; border-left: 3px solid #f39c12;
          padding: 6px 8px; font-size: 10px; color: #856404;
          margin-bottom: 8px; border-radius: 4px;
        }
        #npt-panel .footer-title {
          font-size: 10px; color: #6b21a8; font-weight: bold;
          margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;
        }
        #npt-panel .count-badge {
          background: #7c3aed; color: white;
          padding: 2px 6px; border-radius: 10px;
          font-size: 10px; font-weight: normal;
        }
      `;
      document.head.appendChild(style);
    }

    const panel = document.createElement('div');
    panel.id = 'npt-panel';
    panel.style.display = 'flex';

    panel.innerHTML =
      '<div class="npt-header">' +
        '<h3>NPT Logger v1.2.4</h3>' +
        '<button class="toggle-btn" id="npt-toggle" title="Minimize">_</button>' +
      '</div>' +
      '<div class="npt-scroll" id="npt-body">' +
        '<div class="info-tip">⚠️ Switch calendar to <b>Week</b> view (not Work Week) and filter to <b>Accepted</b> meetings before extracting.</div>' +
        '<div class="npt-section">' +
          '<h4>Settings</h4>' +
          '<input type="text" id="npt-login" placeholder="Your Login (e.g. jdoe)">' +
          '<select id="npt-region"><option value="">Region</option><option value="NA">NA</option><option value="EU">EU</option><option value="INTL">INTL</option><option value="APAC">APAC</option><option value="IX">IX</option><option value="US">US</option></select>' +
          '<select id="npt-team"><option value="">AST Team</option><option value="LCS">LCS</option><option value="GGS">GGS</option><option value="Locale">Locale</option><option value="Publishing">Publishing</option></select>' +
          '<button class="btn btn-secondary" id="npt-save-settings">Save Settings</button>' +
        '</div>' +
        '<div class="npt-section">' +
          '<h4>Step 1: Extract Meetings</h4>' +
          '<button class="btn btn-primary" id="npt-extract">Extract from Calendar</button>' +
        '</div>' +
        '<div class="npt-section">' +
          '<h4>Manual Add</h4>' +
          '<input type="text" id="npt-manual-date" placeholder="Date: 2026-5-27">' +
          '<input type="text" id="npt-manual-subject" placeholder="Subject">' +
          '<div class="row"><label>Min:</label><input type="number" id="npt-manual-duration" value="60" min="1" max="480"></div>' +
          '<select id="npt-manual-activity"><option value="">Activity Type (optional)</option></select>' +
          '<select id="npt-manual-sub" disabled><option value="">Sub Activity (optional)</option></select>' +
          '<button class="btn btn-secondary" id="npt-manual-add">+ Add to List</button>' +
        '</div>' +
        '<div class="npt-section">' +
          '<h4><span>Step 2: Select &amp; Configure</span><span class="count-badge" id="npt-count">0</span></h4>' +
          '<div class="select-controls">' +
            '<button class="btn btn-secondary btn-mini" id="npt-select-all">Select All</button>' +
            '<button class="btn btn-secondary btn-mini" id="npt-select-none">Deselect All</button>' +
          '</div>' +
          '<div id="npt-meetings-list"></div>' +
        '</div>' +
      '</div>' +
      '<div class="npt-footer">' +
        '<div class="footer-title">Actions</div>' +
        '<button class="btn btn-primary" id="npt-submit">📤 Submit to Salesforce</button>' +
        '<button class="btn btn-export" id="npt-export-excel">📥 Export to Excel (CSV)</button>' +
        '<button class="btn btn-danger" id="npt-clear-all">🗑 Clear All Local Data</button>' +
      '</div>';

    document.body.appendChild(panel);
    console.log('[NPT] Panel appended to body');

    // Populate manual activity dropdown
    const manualAct = document.getElementById('npt-manual-activity');
    if (manualAct) {
      Object.keys(ACTIVITY_TYPES).forEach(type => {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = type;
        manualAct.appendChild(opt);
      });
    }

    // Load saved settings
    const savedRegion = GM_getValue('region', '');
    const savedTeam = GM_getValue('astTeam', '');
    const savedLogin = GM_getValue('userLogin', '');
    if (savedRegion) document.getElementById('npt-region').value = savedRegion;
    if (savedTeam) document.getElementById('npt-team').value = savedTeam;
    if (savedLogin) document.getElementById('npt-login').value = savedLogin;

    // Wire up events (each in try-catch)
    safeBind('npt-toggle', 'click', () => {
      const scroll = document.getElementById('npt-body');
      const footer = document.querySelector('#npt-panel .npt-footer');
      const isHidden = scroll.classList.toggle('hidden');
      footer.classList.toggle('hidden', isHidden);
      panel.style.height = isHidden ? 'auto' : '85vh';
    });

    safeBind('npt-save-settings', 'click', () => {
      GM_setValue('region', document.getElementById('npt-region').value);
      GM_setValue('astTeam', document.getElementById('npt-team').value);
      GM_setValue('userLogin', document.getElementById('npt-login').value.trim());
      alert('Settings saved!');
    });

    safeBind('npt-extract', 'click', () => {
      const meetings = extractMeetings();
      const existing = JSON.parse(GM_getValue('meetingsList', '[]'));
      const merged = [...meetings, ...existing.filter(e => e.isManual)];
      GM_setValue('meetingsList', JSON.stringify(merged));
      renderMeetingsList();
      alert('Extracted ' + meetings.length + ' meetings.');
    });

    safeBind('npt-manual-activity', 'change', (e) => {
      const subSelect = document.getElementById('npt-manual-sub');
      const opts = ACTIVITY_TYPES[e.target.value] || [];
      subSelect.innerHTML = '<option value="">Sub Activity (optional)</option>';
      opts.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s; opt.textContent = s;
        subSelect.appendChild(opt);
      });
      subSelect.disabled = opts.length === 0;
    });

    safeBind('npt-manual-add', 'click', () => {
      const date = document.getElementById('npt-manual-date').value.trim();
      const subject = document.getElementById('npt-manual-subject').value.trim();
      const duration = document.getElementById('npt-manual-duration').value;
      const activityType = document.getElementById('npt-manual-activity').value;
      const subActivity = document.getElementById('npt-manual-sub').value;
      if (!date || !subject) { alert('Date and Subject required'); return; }
      const list = JSON.parse(GM_getValue('meetingsList', '[]'));
      list.push({ subject, date, duration: duration || '60', activityType, subActivity, isManual: true });
      GM_setValue('meetingsList', JSON.stringify(list));
      document.getElementById('npt-manual-subject').value = '';
      renderMeetingsList();
    });

    safeBind('npt-select-all', 'click', () => toggleSelectAll(true));
    safeBind('npt-select-none', 'click', () => toggleSelectAll(false));

    safeBind('npt-submit', 'click', () => {
      const region = GM_getValue('region', '');
      const astTeam = GM_getValue('astTeam', '');
      if (!region || !astTeam) { alert('Save Region and AST Team first'); return; }
      const list = JSON.parse(GM_getValue('meetingsList', '[]'));
      const queue = [];
      list.forEach((m, i) => {
        const cb = document.getElementById('npt-check-' + i);
        if (!cb || !cb.checked) return;
        const actType = document.getElementById('npt-act-' + i).value;
        const subAct = document.getElementById('npt-sub-' + i).value;
        const dur = document.getElementById('npt-dur-' + i).value;
        if (!actType) return;
        queue.push({ subject: m.subject, date: m.date, duration: dur || '60', activityType: actType, subActivity: subAct, region, astTeam });
      });
      if (queue.length === 0) { alert('Select meetings and assign activity types'); return; }
      GM_setValue('sfQueue', JSON.stringify(queue));
      GM_openInTab(SF_NPT_NEW_URL, { active: true });
    });

    safeBind('npt-export-excel', 'click', exportToExcel);
    safeBind('npt-clear-all', 'click', clearAllData);

    renderMeetingsList();
    console.log('[NPT] Panel setup complete');
  }

  function safeBind(id, event, handler) {
    const el = document.getElementById(id);
    if (!el) {
      console.warn('[NPT] Element not found:', id);
      return;
    }
    el.addEventListener(event, function(e) {
      try { handler(e); }
      catch (err) {
        console.error('[NPT] Error in handler for', id, ':', err);
        alert('Error: ' + err.message);
      }
    });
  }

  function renderMeetingsList() {
    const container = document.getElementById('npt-meetings-list');
    const countBadge = document.getElementById('npt-count');
    if (!container) return;
    const list = JSON.parse(GM_getValue('meetingsList', '[]'));
    const logged = JSON.parse(GM_getValue('loggedMeetings', '[]'));

    if (countBadge) countBadge.textContent = list.length;

    container.innerHTML = '';
    if (list.length === 0) {
      container.innerHTML = '<p style="color:#888;font-size:11px;">No meetings yet. Click "Extract from Calendar" above.</p>';
      return;
    }

    list.forEach((m, i) => {
      const isLogged = logged.some(l => l.subject === m.subject && l.date === m.date);
      const card = document.createElement('div');
      card.className = 'meeting-card' + (isLogged ? ' logged' : '') + (m.isManual ? ' manual' : '');

      const actOpts = Object.keys(ACTIVITY_TYPES).map(t =>
        '<option value="' + t + '"' + (t === m.activityType ? ' selected' : '') + '>' + t + '</option>'
      ).join('');
      let subOpts = '<option value="">-- Sub --</option>';
      let subDis = 'disabled';
      if (m.activityType && ACTIVITY_TYPES[m.activityType]) {
        subDis = '';
        subOpts += ACTIVITY_TYPES[m.activityType].map(s =>
          '<option value="' + s + '"' + (s === m.subActivity ? ' selected' : '') + '>' + s + '</option>'
        ).join('');
      }

      const badges = (isLogged ? '<span class="badge badge-logged">Logged</span>' : '') +
                     (m.isManual ? '<span class="badge badge-manual">Manual</span>' : '');

      card.innerHTML =
        '<div class="row"><input type="checkbox" id="npt-check-' + i + '">' + badges + '</div>' +
        '<div class="meeting-subject">' + escapeHtml(m.subject) + '</div>' +
        '<div class="meeting-meta">' + m.date + ' | <input type="number" id="npt-dur-' + i + '" value="' + (m.duration || 60) + '" min="1" max="480" style="width:45px;"> min</div>' +
        '<select id="npt-act-' + i + '"><option value="">-- Activity --</option>' + actOpts + '</select>' +
        '<select id="npt-sub-' + i + '" ' + subDis + '>' + subOpts + '</select>';
      container.appendChild(card);

      const actSelect = card.querySelector('#npt-act-' + i);
      if (actSelect) {
        actSelect.addEventListener('change', function(e) {
          const sub = card.querySelector('#npt-sub-' + i);
          const opts = ACTIVITY_TYPES[e.target.value] || [];
          sub.innerHTML = '<option value="">-- Sub --</option>';
          opts.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s; opt.textContent = s;
            sub.appendChild(opt);
          });
          sub.disabled = opts.length === 0;
        });
      }
    });
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ==================== SALESFORCE PAGE ====================
  function initSalesforcePage() {
    if (!window.location.href.includes('Ads_Success__c')) return;
    const observer = new MutationObserver((mutations, obs) => {
      const form = document.querySelector('input[name="NP_Activity_Date__c"]');
      if (form) { obs.disconnect(); setTimeout(processSFQueue, 2000); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      if (document.querySelector('input[name="NP_Activity_Date__c"]')) processSFQueue();
    }, 6000);
  }

  async function processSFQueue() {
    const queue = JSON.parse(GM_getValue('sfQueue', '[]'));
    if (queue.length === 0) return;
    const entry = queue[0];
    console.log('NPT Logger: Filling entry:', entry.subject);
    await fillForm(entry);
    addOverlay(queue.length);
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function selectCombobox(ariaLabel, value) {
    const buttons = document.querySelectorAll('button[role="combobox"]');
    let button = null;
    for (const btn of buttons) {
      if (btn.getAttribute('aria-label') === ariaLabel) { button = btn; break; }
    }
    if (!button) { console.warn('NPT: No combobox:', ariaLabel); return; }
    button.click();
    await sleep(800);
    const options = document.querySelectorAll('[role="option"]');
    for (const opt of options) {
      const spans = opt.querySelectorAll('span');
      for (const span of spans) {
        if (span.textContent.trim() === value) { opt.click(); await sleep(500); return; }
      }
      if (opt.textContent.trim() === value) { opt.click(); await sleep(500); return; }
    }
    document.body.click();
    await sleep(300);
  }

  async function setInput(name, value) {
    const input = document.querySelector('input[name="' + name + '"]');
    if (!input) return;
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
    await sleep(300);
  }

  async function setTextarea(keyword, value) {
    const els = document.querySelectorAll('.slds-form-element');
    for (const el of els) {
      const label = el.querySelector('label, .slds-form-element__label');
      const ta = el.querySelector('textarea');
      if (label && ta && label.textContent.trim().toLowerCase().includes(keyword)) {
        ta.focus();
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(ta, value);
        ta.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        ta.blur();
        await sleep(200);
        return;
      }
    }
  }

  async function fillForm(entry) {
    await sleep(2000);
    if (entry.region) { await selectCombobox('Region', entry.region); await sleep(500); }
    if (entry.date) { await setInput('NP_Activity_Date__c', entry.date); await sleep(500); }
    if (entry.astTeam) { await selectCombobox('AST Team', entry.astTeam); await sleep(500); }
    await selectCombobox('Submisison For', 'Non-Prod Efforts'); await sleep(500);
    if (entry.activityType) { await selectCombobox('Activity Type', entry.activityType); await sleep(800); }
    if (entry.subActivity) {
      const labelMap = { 'Meeting': 'Meeting', 'Training and Development': 'Training and Development', 'SME Activities': 'SME Activities', 'Operations Deep Dive': 'Operations Dive Deep', 'System Issues': 'System Issues' };
      const subLabel = labelMap[entry.activityType];
      if (subLabel) { await selectCombobox(subLabel, entry.subActivity); await sleep(500); }
    }
    if (entry.duration) { await setInput('NP_Time_Taken__c', entry.duration); await sleep(400); }
    if (entry.subject) { await setTextarea('other', entry.subject); await sleep(400); }
  }

  function addOverlay(remaining) {
    const existing = document.getElementById('npt-overlay');
    if (existing) existing.remove();
    const div = document.createElement('div');
    div.id = 'npt-overlay';
    div.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#7c3aed;color:white;padding:16px 24px;border-radius:12px;z-index:99999;font-family:Arial;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
    div.innerHTML =
      '<div style="font-weight:bold;margin-bottom:8px;">NPT Logger</div>' +
      '<div style="margin-bottom:12px;">' + remaining + ' entries remaining</div>' +
      '<button id="npt-save-next" style="background:white;color:#7c3aed;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:bold;margin-right:8px;">' + (remaining > 1 ? 'Save & Next' : 'Save & Done') + '</button>' +
      '<button id="npt-cancel" style="background:transparent;color:white;border:1px solid white;padding:8px 16px;border-radius:6px;cursor:pointer;">Cancel</button>';
    document.body.appendChild(div);

    document.getElementById('npt-save-next').addEventListener('click', () => {
      const queue = JSON.parse(GM_getValue('sfQueue', '[]'));
      if (queue.length > 0) {
        const current = queue[0];
        const logged = JSON.parse(GM_getValue('loggedMeetings', '[]'));
        logged.push({ subject: current.subject, date: current.date, loggedAt: Date.now() });
        GM_setValue('loggedMeetings', JSON.stringify(logged));
      }
      queue.shift();
      GM_setValue('sfQueue', JSON.stringify(queue));
      div.remove();
      if (queue.length > 0) {
        const btn = document.querySelector('button[name="SaveAndNew"]');
        if (btn) btn.click();
        setTimeout(() => { window.location.href = SF_NPT_NEW_URL; }, 2000);
      } else {
        const btn = document.querySelector('button[name="SaveAndNew"]') || document.querySelector('button.slds-button_brand');
        if (btn) btn.click();
      }
    });

    document.getElementById('npt-cancel').addEventListener('click', () => {
      GM_setValue('sfQueue', '[]');
      div.remove();
    });
  }

})();
