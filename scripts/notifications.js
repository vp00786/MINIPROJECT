/**
 * AfterHeal – notifications.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Missed-Dose Alert & Emergency Notification System (simulated).
 *
 * Architecture:
 *   • detectMissedDoses(patientId)   – scans overdue doses, triggers alerts
 *   • triggerAlert(dose, med)        – writes notification + simulates SMS
 *   • renderNotifications(patientId) – renders notification feed in #notif-list
 *   • renderEmergencyContacts(pid)   – renders & manages contacts in #ec-list
 *
 * All logic is localStorage-only. SMS is simulated via in-app log entries.
 * Exported on window.AHNotif for use by patient.js.
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
    'use strict';

    // ── Constants ─────────────────────────────────────────────────────────
    /** A dose is considered "missed" if it's been overdue for this many minutes */
    const MISSED_THRESHOLD_MINS = 30;

    /** Notification types */
    const NOTIF_TYPE = {
        MISSED_DOSE: 'missed_dose',
        SMS_SENT: 'sms_sent',
        SYSTEM: 'system',
    };

    // ── Helpers ───────────────────────────────────────────────────────────
    function getItem(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } }
    function setItem(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
    function uuid() { return 'notif_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36); }
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function fmtTime(iso) {
        return new Date(iso).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }

    // ── Core: Detect Missed Doses ─────────────────────────────────────────
    /**
     * Scan all past-due unconfirmed doses for the patient.
     * For any dose that is more than MISSED_THRESHOLD_MINS overdue and
     * has NOT already generated a notification, trigger an alert.
     */
    function detectMissedDoses(patientId) {
        const now = new Date();
        const thresholdMs = MISSED_THRESHOLD_MINS * 60 * 1000;

        const allDoses = getItem(AH.KEYS.DOSES).filter(d =>
            d.patientId === patientId && !d.takenAt && d.scheduledTime
        );

        const notifications = getItem(AH.KEYS.NOTIFICATIONS);
        // Build set of doseIds already notified about
        const alreadyNotified = new Set(
            notifications.filter(n => n.doseId).map(n => n.doseId)
        );

        const meds = getItem(AH.KEYS.MEDICATIONS);
        const users = getItem(AH.KEYS.USERS);
        const patient = users.find(u => u.id === patientId);

        let newNotifications = [];

        allDoses.forEach(dose => {
            const scheduledMs = new Date(dose.scheduledTime).getTime();
            const overdueMs = now.getTime() - scheduledMs;

            // Only alert if overdue by threshold AND not yet notified
            if (overdueMs >= thresholdMs && !alreadyNotified.has(dose.id)) {
                const med = meds.find(m => m.id === dose.medId);
                if (!med) return;

                // Create the missed-dose notification
                const missedNotif = {
                    id: uuid(), patientId, doseId: dose.id,
                    type: NOTIF_TYPE.MISSED_DOSE,
                    message: `Missed dose: ${med.name} (${med.dosage}) was due at ${fmtTime(dose.scheduledTime)}.`,
                    timestamp: now.toISOString(),
                    read: false,
                };
                newNotifications.push(missedNotif);

                // Simulate SMS to each emergency contact
                const contacts = getItem(AH.KEYS.EMERGENCY_CONTACTS).filter(c => c.patientId === patientId);
                contacts.forEach(contact => {
                    const smsNotif = {
                        id: uuid(), patientId,
                        type: NOTIF_TYPE.SMS_SENT,
                        message: `📱 Simulated SMS to ${esc(contact.name)} (${esc(contact.relation)}) at ${esc(contact.phone)}: "${patient ? patient.name : 'Patient'} missed ${med.name} dose due at ${fmtTime(dose.scheduledTime)}."`,
                        timestamp: now.toISOString(),
                        read: false,
                        contactId: contact.id,
                        doseId: dose.id,
                    };
                    newNotifications.push(smsNotif);
                });
            }
        });

        if (newNotifications.length) {
            const existing = getItem(AH.KEYS.NOTIFICATIONS);
            setItem(AH.KEYS.NOTIFICATIONS, [...existing, ...newNotifications]);
            console.log(`[AfterHeal Notifications] ${newNotifications.length} new alert(s) created.`);
        }

        return newNotifications.length;
    }

    // ── Unread Count ──────────────────────────────────────────────────────
    function getUnreadCount(patientId) {
        return getItem(AH.KEYS.NOTIFICATIONS)
            .filter(n => n.patientId === patientId && !n.read).length;
    }

    // ── Mark Read ─────────────────────────────────────────────────────────
    function markAllRead(patientId) {
        const notifs = getItem(AH.KEYS.NOTIFICATIONS).map(n =>
            n.patientId === patientId ? { ...n, read: true } : n
        );
        setItem(AH.KEYS.NOTIFICATIONS, notifs);
    }

    function markOneRead(notifId) {
        const notifs = getItem(AH.KEYS.NOTIFICATIONS).map(n =>
            n.id === notifId ? { ...n, read: true } : n
        );
        setItem(AH.KEYS.NOTIFICATIONS, notifs);
    }

    // ── Render: Notification Feed ──────────────────────────────────────────
    function renderNotifications(patientId) {
        const container = document.getElementById('notif-list');
        if (!container) return;

        const notifs = getItem(AH.KEYS.NOTIFICATIONS)
            .filter(n => n.patientId === patientId)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Update bell badge
        updateBadge(patientId);

        if (!notifs.length) {
            container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔔</div>
                <p>No notifications yet.<br>Missed doses will appear here with SMS simulation logs.</p>
            </div>`;
            return;
        }

        const typeIcon = { missed_dose: '⚠️', sms_sent: '📱', system: 'ℹ️' };
        const typeColor = { missed_dose: 'var(--poor)', sms_sent: 'var(--primary)', system: 'var(--moderate)' };
        const typeBadge = { missed_dose: 'badge-poor', sms_sent: 'badge-primary', system: 'badge-primary' };

        container.innerHTML = notifs.map(n => `
            <div class="notif-item ${n.read ? 'notif-read' : 'notif-unread'}" id="notif-${n.id}">
                <div class="notif-icon" style="color:${typeColor[n.type] || 'var(--text-muted)'}">
                    ${typeIcon[n.type] || '🔔'}
                </div>
                <div class="notif-body">
                    <div class="notif-msg">${esc(n.message)}</div>
                    <div class="notif-meta">
                        <span class="badge ${typeBadge[n.type] || 'badge-primary'}" style="font-size:0.68rem">
                            ${n.type === 'missed_dose' ? 'Missed Dose Alert' : n.type === 'sms_sent' ? 'SMS Notification' : 'System'}
                        </span>
                        <span style="font-size:0.73rem; color:var(--text-muted)">${fmtTime(n.timestamp)}</span>
                    </div>
                </div>
                ${!n.read ? `<button class="btn btn-ghost btn-sm" style="flex-shrink:0" onclick="AHNotif.markOneRead('${n.id}'); AHNotif.renderNotifications('${patientId}')">✓</button>` : ''}
            </div>`).join('');
    }

    // ── Update Badge ──────────────────────────────────────────────────────
    function updateBadge(patientId) {
        const count = getUnreadCount(patientId);
        const badge = document.getElementById('notif-badge');
        const navBadge = document.getElementById('nav-notif-badge');

        if (badge) {
            badge.textContent = count > 0 ? (count > 9 ? '9+' : count) : '';
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
        if (navBadge) {
            navBadge.textContent = count > 0 ? count : '';
            navBadge.style.display = count > 0 ? 'inline-flex' : 'none';
        }

        // Update section stat
        const statEl = document.getElementById('stat-notif-count');
        if (statEl) statEl.textContent = getItem(AH.KEYS.NOTIFICATIONS).filter(n => n.patientId === patientId).length;
    }

    // ── Render: Emergency Contacts ─────────────────────────────────────────
    function renderEmergencyContacts(patientId) {
        const container = document.getElementById('ec-list');
        if (!container) return;

        const contacts = getItem(AH.KEYS.EMERGENCY_CONTACTS).filter(c => c.patientId === patientId);

        if (!contacts.length) {
            container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📞</div>
                <p>No emergency contacts added.<br>Add contacts to receive missed-dose SMS alerts.</p>
            </div>`;
            return;
        }

        container.innerHTML = contacts.map((c, i) => {
            const colors = ['#3B91E2', '#00C9A0', '#6C5CE7', '#F0A500'];
            return `
            <div class="ec-card" id="ec-card-${c.id}">
                <div class="ec-avatar" style="background:${colors[i % colors.length]}">${c.name.charAt(0).toUpperCase()}</div>
                <div class="ec-info">
                    <div class="ec-name">${esc(c.name)}</div>
                    <div class="ec-meta">
                        <span class="badge badge-primary" style="font-size:0.68rem">${esc(c.relation)}</span>
                        <span style="font-size:0.78rem; color:var(--text-muted)">${esc(c.phone)}</span>
                    </div>
                    ${c.notifiedAt ? `<div style="font-size:0.72rem; color:var(--text-muted); margin-top:4px">Last notified: ${fmtTime(c.notifiedAt)}</div>` : ''}
                </div>
                <button class="btn btn-danger btn-sm" style="flex-shrink:0" onclick="AHNotif.deleteContact('${c.id}','${patientId}')">🗑</button>
            </div>`;
        }).join('');
    }

    // ── Add / Delete Contact ──────────────────────────────────────────────
    function addContact(patientId, name, relation, phone) {
        if (!name || !phone) return false;
        const contacts = getItem(AH.KEYS.EMERGENCY_CONTACTS);
        contacts.push({ id: uuid(), patientId, name, relation: relation || 'Emergency Contact', phone, notifiedAt: null });
        setItem(AH.KEYS.EMERGENCY_CONTACTS, contacts);
        return true;
    }

    function deleteContact(contactId, patientId) {
        if (!confirm('Remove this emergency contact?')) return;
        setItem(AH.KEYS.EMERGENCY_CONTACTS,
            getItem(AH.KEYS.EMERGENCY_CONTACTS).filter(c => c.id !== contactId)
        );
        renderEmergencyContacts(patientId);
        AH.showToast('Contact removed.', 'warning');
    }

    // ── Clear All Notifications ───────────────────────────────────────────
    function clearAllNotifications(patientId) {
        setItem(AH.KEYS.NOTIFICATIONS,
            getItem(AH.KEYS.NOTIFICATIONS).filter(n => n.patientId !== patientId)
        );
    }

    // ── Public API ────────────────────────────────────────────────────────
    window.AHNotif = {
        detectMissedDoses,
        getUnreadCount,
        markAllRead,
        markOneRead,
        updateBadge,
        renderNotifications,
        renderEmergencyContacts,
        addContact,
        deleteContact,
        clearAllNotifications,
    };

})();
