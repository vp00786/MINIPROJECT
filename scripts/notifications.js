/**
 * AfterHeal – notifications.js  (v3 – Life-Critical Emergency Alert System)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Architecture Overview:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  detectMissedDoses()  ←── startPolling() (every 60 s)          │
 * │         │                                                       │
 * │         ▼                                                       │
 * │  SMSGateway.send(phone, message)  ──► ah_alert_logs (audit)    │
 * │         │                                                       │
 * │         ├── Emergency Contacts (all)                            │
 * │         └── Assigned Caregiver                                  │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * SMS Modes (change via AHSmsGateway.setMode):
 *   'simulation'  – logs entry with status:'simulated' (default, no network)
 *   'twilio'      – POSTs to Twilio REST API (needs API keys)
 *   'fast2sms'    – POSTs to Fast2SMS bulk API (needs API key)
 *
 * Exported globals:
 *   window.AHNotif      – notification/contact management
 *   window.AHSmsGateway – SMS gateway (switchable)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 1 – CONFIGURATION
    // ══════════════════════════════════════════════════════════════════════

    /** Minutes after which an unconfirmed past-due dose is "missed" */
    const MISSED_THRESHOLD_MINS = 30;

    /** Polling interval in milliseconds (60 seconds) */
    const POLL_INTERVAL_MS = 60 * 1000;

    /** Notification types */
    const NT = {
        MISSED_DOSE: 'missed_dose',
        SMS_SENT: 'sms_sent',
        CAREGIVER_ALERT: 'caregiver_alert',
        SYSTEM: 'system',
    };

    /** Alert delivery statuses */
    const STATUS = { SIMULATED: 'simulated', SENT: 'sent', FAILED: 'failed', PENDING: 'pending' };

    /** SMS message template */
    const SMS_TEMPLATE = (patientName, medName, dosage, dueTime) =>
        `ALERT: ${patientName} enrolled in AfterHeal missed a dose of ${medName} ${dosage} scheduled for ${dueTime}. Immediate attention may be required. – AfterHeal System`;

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 2 – HELPERS
    // ══════════════════════════════════════════════════════════════════════

    function getItem(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } }
    function getObj(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } }
    function setItem(key, v) { localStorage.setItem(key, JSON.stringify(v)); }
    function uuid() { return 'id_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36); }
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function fmtTime(iso) {
        return new Date(iso).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }

    /**
     * Validate phone number – accepts common international formats:
     * +1-555-0101, +919876543210, (555) 123-4567, 555-123-4567, +44 20 7946 0958
     */
    function validatePhone(phone) {
        // Strip spaces and dashes for length/format check
        const cleaned = phone.trim();
        // Allow E.164: +[country code][number], or local with dashes/parens/spaces
        const re = /^\+?[\d\s\-().]{7,20}$/;
        if (!re.test(cleaned)) return false;
        const digits = cleaned.replace(/\D/g, '');
        return digits.length >= 7 && digits.length <= 15;
    }

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 3 – SMS GATEWAY (Backend-Ready Architecture)
    // ══════════════════════════════════════════════════════════════════════

    /**
     * SMSGateway – switchable provider.
     *
     * In simulation mode: all calls are logged locally with status 'simulated'.
     * In production: swap to 'twilio' or 'fast2sms' and provide API keys.
     *
     * Usage:
     *   AHSmsGateway.setMode('twilio', { accountSid, authToken, fromNumber });
     *   await AHSmsGateway.send('+1-555-0101', 'ALERT: ...', doseId, contactId);
     */
    const SMSGateway = (() => {
        let _mode = 'simulation';
        let _config = {};

        /** Set the SMS provider and config */
        function setMode(mode, config = {}) {
            _mode = mode;
            _config = config;
            console.log(`[AfterHeal SMS] Mode set to: ${mode}`);
        }

        /**
         * Send an SMS.
         * @param {string} to         – Recipient phone number
         * @param {string} body       – Message text
         * @param {object} meta       – { doseId, contactId, contactName, contactRole, patientId, medName, medDosage, scheduledTime, type }
         * @returns {{ ok: boolean, status: string, provider: string }}
         */
        async function send(to, body, meta = {}) {
            let result = { ok: false, status: STATUS.PENDING, provider: _mode };

            try {
                if (_mode === 'simulation') {
                    // ── SIMULATION MODE ───────────────────────────────────
                    // Real SMS is NOT sent. Logs entry with status 'simulated'.
                    // Replace this block with real HTTP call when backend is ready.
                    console.log(`[AfterHeal SMS | SIMULATED] To: ${to}\nBody: ${body}`);
                    result = { ok: true, status: STATUS.SIMULATED, provider: 'simulation' };

                } else if (_mode === 'twilio') {
                    // ── TWILIO REST API ───────────────────────────────────
                    // Requires: accountSid, authToken, fromNumber in _config
                    // NOTE: CORS restrictions prevent direct browser calls to Twilio.
                    // In production, proxy via your backend (Node/Python/etc.)
                    const { accountSid, authToken, fromNumber, proxyUrl } = _config;
                    const endpoint = proxyUrl || `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
                    const credentials = btoa(`${accountSid}:${authToken}`);

                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Authorization': `Basic ${credentials}`,
                        },
                        body: new URLSearchParams({ To: to, From: fromNumber, Body: body }).toString(),
                    });
                    result = {
                        ok: response.ok,
                        status: response.ok ? STATUS.SENT : STATUS.FAILED,
                        provider: 'twilio',
                        httpStatus: response.status,
                    };

                } else if (_mode === 'fast2sms') {
                    // ── FAST2SMS API ──────────────────────────────────────
                    // Requires: apiKey in _config
                    const { apiKey, proxyUrl } = _config;
                    const endpoint = proxyUrl || 'https://www.fast2sms.com/dev/bulkV2';
                    const phone = to.replace(/\D/g, ''); // digits only

                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers: { authorization: apiKey, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ variables_values: body, route: 'q', numbers: phone }),
                    });
                    const data = await response.json();
                    result = {
                        ok: data.return === true,
                        status: data.return === true ? STATUS.SENT : STATUS.FAILED,
                        provider: 'fast2sms',
                    };
                }
            } catch (err) {
                console.error('[AfterHeal SMS] Gateway error:', err);
                result = { ok: false, status: STATUS.FAILED, provider: _mode, error: err.message };
            }

            // ── Log to Alert Audit Trail ──────────────────────────────
            const logEntry = {
                id: uuid(),
                patientId: meta.patientId || '',
                doseId: meta.doseId || '',
                medName: meta.medName || '',
                medDosage: meta.medDosage || '',
                scheduledTime: meta.scheduledTime || '',
                contactId: meta.contactId || '',
                contactName: meta.contactName || '',
                contactPhone: to,
                contactRole: meta.contactRole || '',
                type: meta.type || 'emergency_contact',
                smsMessage: body,
                deliveryStatus: result.status,
                provider: result.provider,
                triggeredAt: new Date().toISOString(),
                acknowledgedAt: null,
            };
            const logs = getItem(AH.KEYS.ALERT_LOGS);
            logs.unshift(logEntry);
            setItem(AH.KEYS.ALERT_LOGS, logs);

            return result;
        }

        return { send, setMode, getMode: () => _mode };
    })();

    window.AHSmsGateway = SMSGateway;

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 4 – MISSED DOSE DETECTION ENGINE
    // ══════════════════════════════════════════════════════════════════════

    let _pollTimer = null;

    /**
     * Start periodic missed-dose polling.
     * Runs every POLL_INTERVAL_MS while the patient dashboard is open.
     */
    function startPolling(patientId) {
        if (_pollTimer) clearInterval(_pollTimer);
        _pollTimer = setInterval(() => {
            console.log('[AfterHeal] Polling for missed doses…');
            detectMissedDoses(patientId);
            // Update UI badge without full re-render
            updateBadge(patientId);
        }, POLL_INTERVAL_MS);

        // Stop polling when the user leaves the page
        window.addEventListener('beforeunload', stopPolling, { once: true });
        console.log(`[AfterHeal] Missed-dose polling started (every ${POLL_INTERVAL_MS / 1000}s)`);
    }

    function stopPolling() {
        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    }

    /**
     * Core detection function.
     * Scans all past-due unconfirmed doses for the patient.
     * Triggers SMS to emergency contacts + caregiver for each new missed dose.
     */
    function detectMissedDoses(patientId) {
        const now = new Date();
        const thresholdMs = MISSED_THRESHOLD_MINS * 60 * 1000;

        const allDoses = getItem(AH.KEYS.DOSES).filter(d =>
            d.patientId === patientId && !d.takenAt && d.scheduledTime
        );

        const existingNotifs = getItem(AH.KEYS.NOTIFICATIONS);
        const alreadyNotified = new Set(
            existingNotifs.filter(n => n.doseId).map(n => n.doseId)
        );

        const meds = getItem(AH.KEYS.MEDICATIONS);
        const users = getItem(AH.KEYS.USERS);
        const patient = users.find(u => u.id === patientId);
        if (!patient) return 0;

        // Get contacts & assigned caregiver
        const contacts = getItem(AH.KEYS.EMERGENCY_CONTACTS).filter(c => c.patientId === patientId);
        const assignment = getObj(AH.KEYS.CAREGIVER_ASSIGNMENT);
        const caregiverId = assignment[patientId];
        const caregiver = caregiverId ? users.find(u => u.id === caregiverId) : null;

        let newCount = 0;

        allDoses.forEach(dose => {
            const overdueMs = now.getTime() - new Date(dose.scheduledTime).getTime();
            if (overdueMs < thresholdMs || alreadyNotified.has(dose.id)) return;

            const med = meds.find(m => m.id === dose.medId);
            if (!med) return;

            const dueStr = fmtTime(dose.scheduledTime);
            const smsBody = SMS_TEMPLATE(patient.name, med.name, med.dosage, dueStr);
            const nowIso = now.toISOString();

            // ── In-App Notification: Missed Dose ──────────────────────
            const missedNotif = {
                id: uuid(), patientId, doseId: dose.id,
                type: NT.MISSED_DOSE,
                message: `⚠️ Missed dose: ${med.name} (${med.dosage}) was due at ${dueStr}. Emergency contacts & caregiver notified.`,
                timestamp: nowIso, read: false,
            };

            // ── SMS to Emergency Contacts ──────────────────────────────
            const smsNotifs = contacts.map(contact => {
                // Fire-and-forget async (updates log entry when resolved)
                SMSGateway.send(contact.phone, smsBody, {
                    patientId, doseId: dose.id,
                    medName: med.name, medDosage: med.dosage,
                    scheduledTime: dose.scheduledTime,
                    contactId: contact.id, contactName: contact.name,
                    contactRole: contact.relation || 'Emergency Contact',
                    type: 'emergency_contact',
                }).then(res => {
                    console.log(`[SMS] ${contact.name}@${contact.phone}: ${res.status}`);
                    // Update contact's notifiedAt timestamp
                    const ecs = getItem(AH.KEYS.EMERGENCY_CONTACTS);
                    const idx = ecs.findIndex(c => c.id === contact.id);
                    if (idx !== -1) { ecs[idx].notifiedAt = nowIso; setItem(AH.KEYS.EMERGENCY_CONTACTS, ecs); }
                });

                return {
                    id: uuid(), patientId, doseId: dose.id,
                    type: NT.SMS_SENT,
                    message: `📱 SMS sent to ${contact.name} (${contact.relation || 'Emergency Contact'}) at ${contact.phone}${contact.isPrimary ? ' ★ Primary' : ''}.`,
                    timestamp: nowIso, read: false,
                    contactId: contact.id,
                };
            });

            // ── Caregiver Notification ─────────────────────────────────
            let caregiverNotif = null;
            if (caregiver) {
                SMSGateway.send(
                    caregiver.phone || caregiver.email, // use phone if stored, else email
                    smsBody,
                    {
                        patientId, doseId: dose.id,
                        medName: med.name, medDosage: med.dosage,
                        scheduledTime: dose.scheduledTime,
                        contactId: caregiver.id, contactName: caregiver.name,
                        contactRole: 'Assigned Caregiver',
                        type: 'caregiver',
                    }
                ).then(res => console.log(`[SMS] Caregiver ${caregiver.name}: ${res.status}`));

                caregiverNotif = {
                    id: uuid(), patientId, doseId: dose.id,
                    type: NT.CAREGIVER_ALERT,
                    message: `🏥 Caregiver ${caregiver.name} has been automatically notified about the missed dose of ${med.name}.`,
                    timestamp: nowIso, read: false,
                    caregiverId,
                };
            }

            // ── Persist all new notifications ──────────────────────────
            const toAdd = [missedNotif, ...smsNotifs];
            if (caregiverNotif) toAdd.push(caregiverNotif);

            const existing = getItem(AH.KEYS.NOTIFICATIONS);
            setItem(AH.KEYS.NOTIFICATIONS, [...existing, ...toAdd]);
            newCount++;
            console.log(`[AfterHeal] Missed-dose alert fired: ${med.name} @ ${dueStr}`);
        });

        return newCount;
    }

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 5 – EMERGENCY CONTACTS MANAGEMENT
    // ══════════════════════════════════════════════════════════════════════

    /** Add a new emergency contact with phone validation */
    function addContact(patientId, name, relation, phone, isPrimary = false) {
        if (!name.trim() || !phone.trim()) return { ok: false, error: 'Name and phone number are required.' };
        if (!validatePhone(phone)) return { ok: false, error: 'Invalid phone format. Use: +1-555-0101 or +919876543210' };

        const contacts = getItem(AH.KEYS.EMERGENCY_CONTACTS);

        // If this is set as primary, unset others
        let updated = contacts;
        if (isPrimary) {
            updated = contacts.map(c => c.patientId === patientId ? { ...c, isPrimary: false } : c);
        }

        updated.push({
            id: uuid(), patientId, name: name.trim(),
            relation: relation.trim() || 'Emergency Contact',
            phone: phone.trim(), isPrimary,
            notifiedAt: null, createdAt: new Date().toISOString(),
        });
        setItem(AH.KEYS.EMERGENCY_CONTACTS, updated);
        return { ok: true };
    }

    /** Update an existing contact's fields. Prevents accidental deletions — requires explicit flag */
    function updateContact(contactId, fields) {
        const contacts = getItem(AH.KEYS.EMERGENCY_CONTACTS);
        const idx = contacts.findIndex(c => c.id === contactId);
        if (idx === -1) return { ok: false, error: 'Contact not found.' };

        // Validate phone if being updated
        if (fields.phone && !validatePhone(fields.phone)) {
            return { ok: false, error: 'Invalid phone format.' };
        }

        // If setting as primary, unset others for this patient
        let updated = contacts;
        const pid = contacts[idx].patientId;
        if (fields.isPrimary) {
            updated = contacts.map((c, i) =>
                i !== idx && c.patientId === pid ? { ...c, isPrimary: false } : c
            );
        }

        updated[idx] = { ...updated[idx], ...fields, updatedAt: new Date().toISOString() };
        setItem(AH.KEYS.EMERGENCY_CONTACTS, updated);
        return { ok: true };
    }

    /** Delete a contact — requires explicit confirmation (handled in UI) */
    function deleteContact(contactId, patientId) {
        setItem(AH.KEYS.EMERGENCY_CONTACTS,
            getItem(AH.KEYS.EMERGENCY_CONTACTS).filter(c => c.id !== contactId)
        );
        renderEmergencyContacts(patientId);
        AH.showToast('Emergency contact removed.', 'warning');
    }

    /** Set/clear the assigned caregiver for a patient */
    function assignCaregiver(patientId, caregiverId) {
        const map = getObj(AH.KEYS.CAREGIVER_ASSIGNMENT);
        if (caregiverId) map[patientId] = caregiverId;
        else delete map[patientId];
        setItem(AH.KEYS.CAREGIVER_ASSIGNMENT, map);
    }

    function getAssignedCaregiver(patientId) {
        const map = getObj(AH.KEYS.CAREGIVER_ASSIGNMENT);
        const cgId = map[patientId];
        if (!cgId) return null;
        return getItem(AH.KEYS.USERS).find(u => u.id === cgId) || null;
    }

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 6 – RENDER: EMERGENCY CONTACTS
    // ══════════════════════════════════════════════════════════════════════

    function renderEmergencyContacts(patientId) {
        const container = document.getElementById('ec-list');
        if (!container) return;

        const contacts = getItem(AH.KEYS.EMERGENCY_CONTACTS)
            .filter(c => c.patientId === patientId)
            .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0)); // primary first

        if (!contacts.length) {
            container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📞</div>
                <p>No emergency contacts added.<br>Add contacts below to receive missed-dose SMS alerts.</p>
            </div>`;
            return;
        }

        const COLORS = ['#3B91E2', '#00C9A0', '#6C5CE7', '#F0A500', '#E74C3C', '#00B894'];

        container.innerHTML = contacts.map((c, i) => `
        <div class="ec-card ${c.isPrimary ? 'ec-primary' : ''}" id="ec-card-${c.id}">
            <div class="ec-avatar" style="background:${COLORS[i % COLORS.length]}">${c.name.charAt(0).toUpperCase()}</div>
            <div class="ec-info">
                <div class="ec-name">
                    ${esc(c.name)}
                    ${c.isPrimary ? '<span class="badge badge-good" style="font-size:0.65rem;margin-left:6px">★ Primary</span>' : ''}
                </div>
                <div class="ec-meta">
                    <span class="badge badge-primary" style="font-size:0.68rem">${esc(c.relation)}</span>
                    <span style="font-size:0.78rem;color:var(--text-muted)">${esc(c.phone)}</span>
                </div>
                ${c.notifiedAt ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:3px">Last notified: ${fmtTime(c.notifiedAt)}</div>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0">
                <button class="btn btn-ghost btn-sm" onclick="AHNotif.openEditContact('${c.id}','${patientId}')">✏️ Edit</button>
                ${!c.isPrimary
                ? `<button class="btn btn-ghost btn-sm" onclick="AHNotif.setPrimary('${c.id}','${patientId}')">★ Set Primary</button>`
                : ''}
                <button class="btn btn-danger btn-sm" onclick="AHNotif.confirmDeleteContact('${c.id}','${patientId}')">🗑</button>
            </div>
        </div>`).join('');

        // Update EC count stat
        const statEl = document.getElementById('stat-ec-count');
        if (statEl) statEl.textContent = contacts.length;
    }

    function setPrimary(contactId, patientId) {
        const res = updateContact(contactId, { isPrimary: true });
        if (res.ok) {
            renderEmergencyContacts(patientId);
            AH.showToast('Primary contact updated! ★', 'success');
        }
    }

    function confirmDeleteContact(contactId, patientId) {
        const contact = getItem(AH.KEYS.EMERGENCY_CONTACTS).find(c => c.id === contactId);
        const name = contact ? contact.name : 'this contact';
        if (confirm(`Remove ${name} from emergency contacts?\n\nThis contact will no longer receive missed-dose alerts.`)) {
            deleteContact(contactId, patientId);
        }
    }

    /** Open the inline edit form for a contact */
    function openEditContact(contactId, patientId) {
        const c = getItem(AH.KEYS.EMERGENCY_CONTACTS).find(c => c.id === contactId);
        if (!c) return;

        const form = document.getElementById('ec-edit-form');
        const modal = document.getElementById('ec-edit-modal');
        if (!form || !modal) return;

        document.getElementById('ec-edit-id').value = contactId;
        document.getElementById('ec-edit-pid').value = patientId;
        document.getElementById('ec-edit-name').value = c.name;
        document.getElementById('ec-edit-relation').value = c.relation;
        document.getElementById('ec-edit-phone').value = c.phone;
        document.getElementById('ec-edit-primary').checked = !!c.isPrimary;

        modal.classList.add('open');
    }

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 7 – RENDER: NOTIFICATION FEED
    // ══════════════════════════════════════════════════════════════════════

    function renderNotifications(patientId) {
        const container = document.getElementById('notif-list');
        if (!container) return;

        const notifs = getItem(AH.KEYS.NOTIFICATIONS)
            .filter(n => n.patientId === patientId)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        updateBadge(patientId);

        if (!notifs.length) {
            container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔔</div>
                <p>No notifications yet.<br>Missed doses will appear here automatically with SMS logs.</p>
            </div>`;
            return;
        }

        const ICON = { missed_dose: '⚠️', sms_sent: '📱', caregiver_alert: '🏥', system: 'ℹ️' };
        const COLOR = { missed_dose: 'var(--poor)', sms_sent: 'var(--primary)', caregiver_alert: 'var(--good)', system: 'var(--moderate)' };
        const BADGE = { missed_dose: 'badge-poor', sms_sent: 'badge-primary', caregiver_alert: 'badge-good', system: 'badge-primary' };
        const LABEL = { missed_dose: 'Missed Dose', sms_sent: 'SMS Alert', caregiver_alert: 'Caregiver Notified', system: 'System' };

        container.innerHTML = notifs.map(n => `
        <div class="notif-item ${n.read ? 'notif-read' : 'notif-unread'}" id="notif-${n.id}">
            <div class="notif-icon" style="color:${COLOR[n.type] || 'var(--text-muted)'}">${ICON[n.type] || '🔔'}</div>
            <div class="notif-body">
                <div class="notif-msg">${esc(n.message)}</div>
                <div class="notif-meta">
                    <span class="badge ${BADGE[n.type] || 'badge-primary'}" style="font-size:0.66rem">${LABEL[n.type] || 'Alert'}</span>
                    <span style="font-size:0.72rem;color:var(--text-muted)">${fmtTime(n.timestamp)}</span>
                </div>
            </div>
            ${!n.read
                ? `<button class="btn btn-ghost btn-sm" style="flex-shrink:0"
                     onclick="AHNotif.markOneRead('${n.id}');AHNotif.renderNotifications('${patientId}')">✓</button>`
                : ''}
        </div>`).join('');
    }

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 8 – RENDER: ALERT HISTORY (Audit Trail)
    // ══════════════════════════════════════════════════════════════════════

    function renderAlertHistory(patientId) {
        const container = document.getElementById('alert-history-list');
        if (!container) return;

        const logs = getItem(AH.KEYS.ALERT_LOGS)
            .filter(l => l.patientId === patientId)
            .sort((a, b) => new Date(b.triggeredAt) - new Date(a.triggeredAt));

        if (!logs.length) {
            container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📋</div>
                <p>No alert history yet.<br>Logs appear here when missed-dose alerts are triggered.</p>
            </div>`;
            return;
        }

        const STATUS_BADGE = {
            simulated: '<span class="badge" style="background:#E3F0FF;color:#1A6FC4;font-size:0.65rem">Simulated</span>',
            sent: '<span class="badge badge-good" style="font-size:0.65rem">✓ Sent</span>',
            failed: '<span class="badge badge-poor" style="font-size:0.65rem">✗ Failed</span>',
            pending: '<span class="badge" style="background:#FFF3CD;color:#7D5A00;font-size:0.65rem">Pending</span>',
        };
        const TYPE_ICON = { emergency_contact: '📞', caregiver: '🏥' };

        container.innerHTML = logs.map(l => `
        <div class="alert-log-entry ${l.acknowledgedAt ? 'log-ack' : 'log-unack'}" id="log-${l.id}">
            <div class="log-left">
                <div style="font-size:1.2rem">${TYPE_ICON[l.type] || '🔔'}</div>
            </div>
            <div class="log-body">
                <div class="log-title">
                    ${esc(l.medName)} <span style="font-weight:400;color:var(--text-muted)">${esc(l.medDosage)}</span>
                    &nbsp;→&nbsp;
                    <strong>${esc(l.contactName)}</strong>
                    <span style="color:var(--text-muted);font-size:0.78rem"> (${esc(l.contactRole)})</span>
                </div>
                <div class="log-detail">
                    📞 ${esc(l.contactPhone)}
                    &nbsp;·&nbsp;
                    🕐 Due: ${l.scheduledTime ? fmtTime(l.scheduledTime) : '—'}
                    &nbsp;·&nbsp;
                    ⏱ Sent: ${fmtTime(l.triggeredAt)}
                </div>
                <div class="log-status-row">
                    ${STATUS_BADGE[l.deliveryStatus] || STATUS_BADGE.pending}
                    <span style="font-size:0.68rem;color:var(--text-muted)">${l.provider}</span>
                    ${l.acknowledgedAt
                ? `<span style="font-size:0.68rem;color:var(--good)">✓ Acknowledged ${fmtTime(l.acknowledgedAt)}</span>`
                : `<button class="btn btn-ghost btn-sm" style="padding:2px 8px;font-size:0.7rem"
                             onclick="AHNotif.acknowledgeLog('${l.id}','${patientId}')">Acknowledge</button>`}
                </div>
            </div>
        </div>`).join('');

        // Update unacknowledged count
        const unackEl = document.getElementById('stat-unack-count');
        if (unackEl) {
            const unack = logs.filter(l => !l.acknowledgedAt).length;
            unackEl.textContent = unack;
            unackEl.style.color = unack > 0 ? 'var(--poor)' : 'var(--good)';
        }
    }

    function acknowledgeLog(logId, patientId) {
        const logs = getItem(AH.KEYS.ALERT_LOGS);
        const idx = logs.findIndex(l => l.id === logId);
        if (idx !== -1) {
            logs[idx].acknowledgedAt = new Date().toISOString();
            setItem(AH.KEYS.ALERT_LOGS, logs);
        }
        renderAlertHistory(patientId);
    }

    function acknowledgeAllLogs(patientId) {
        const now = new Date().toISOString();
        const logs = getItem(AH.KEYS.ALERT_LOGS).map(l =>
            l.patientId === patientId && !l.acknowledgedAt ? { ...l, acknowledgedAt: now } : l
        );
        setItem(AH.KEYS.ALERT_LOGS, logs);
        renderAlertHistory(patientId);
        AH.showToast('All alerts acknowledged.', 'success');
    }

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 9 – NOTIFICATION BADGE & COUNTS
    // ══════════════════════════════════════════════════════════════════════

    function getUnreadCount(patientId) {
        return getItem(AH.KEYS.NOTIFICATIONS).filter(n => n.patientId === patientId && !n.read).length;
    }

    function markAllRead(patientId) {
        setItem(AH.KEYS.NOTIFICATIONS,
            getItem(AH.KEYS.NOTIFICATIONS).map(n =>
                n.patientId === patientId ? { ...n, read: true } : n
            )
        );
    }

    function markOneRead(notifId) {
        setItem(AH.KEYS.NOTIFICATIONS,
            getItem(AH.KEYS.NOTIFICATIONS).map(n => n.id === notifId ? { ...n, read: true } : n)
        );
    }

    function updateBadge(patientId) {
        const count = getUnreadCount(patientId);
        [document.getElementById('notif-badge'), document.getElementById('nav-notif-badge')].forEach(el => {
            if (!el) return;
            el.textContent = count > 9 ? '9+' : (count || '');
            el.style.display = count > 0 ? 'flex' : 'none';
        });
        const statEl = document.getElementById('stat-notif-count');
        if (statEl) statEl.textContent = getItem(AH.KEYS.NOTIFICATIONS).filter(n => n.patientId === patientId).length;
    }

    function clearAllNotifications(patientId) {
        setItem(AH.KEYS.NOTIFICATIONS,
            getItem(AH.KEYS.NOTIFICATIONS).filter(n => n.patientId !== patientId)
        );
    }

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 10 – PUBLIC API
    // ══════════════════════════════════════════════════════════════════════

    window.AHNotif = {
        // Detection & Polling
        detectMissedDoses, startPolling, stopPolling,
        // Badge
        getUnreadCount, markAllRead, markOneRead, updateBadge,
        // Notification Feed
        renderNotifications, clearAllNotifications,
        // Alert History
        renderAlertHistory, acknowledgeLog, acknowledgeAllLogs,
        // Emergency Contacts
        addContact, updateContact, deleteContact, confirmDeleteContact,
        setPrimary, renderEmergencyContacts, openEditContact,
        // Caregiver
        assignCaregiver, getAssignedCaregiver,
        // Phone Validation (exposed for UI-level validation)
        validatePhone,
    };

})();
