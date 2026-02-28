/**
 * AfterHeal – patient.js  (v3 – Emergency Alert Integration)
 * ─────────────────────────────────────────────────────────────────────────────
 * Patient Dashboard:
 *   • Medication tracker with per-doctor filter
 *   • Appointment management (upcoming/missed/attended) with per-doctor filter
 *   • Emergency Contacts management (validation, primary, edit, caregiver assign)
 *   • Missed-dose alert integration via notifications.js (AHNotif + AHSmsGateway)
 *   • Alert History (audit trail) rendering
 *   • Periodic missed-dose polling (setInterval)
 *   • Daily adherence summary
 * ─────────────────────────────────────────────────────────────────────────────
 */

document.addEventListener('DOMContentLoaded', () => {

    // ── Auth Guard ────────────────────────────────────────────────────────
    const session = AH.requireAuth('patient');
    if (!session) return;

    // ── Sidebar / Topbar ─────────────────────────────────────────────────
    AH.populateSidebarUser(session);
    AH.setTopbarDate();
    AH.initSidebarToggle();
    AH.initLogout();
    AH.initNavLinks();

    // ── Filter State ──────────────────────────────────────────────────────
    let _apptDoctorFilter = '';
    let _medDoctorFilter = '';

    // ── Load All ──────────────────────────────────────────────────────────
    function loadAll() {
        if (window.AHNotif) {
            AHNotif.detectMissedDoses(session.userId);
            AHNotif.updateBadge(session.userId);
        }
        renderAdherenceSummary();
        renderOverviewAlertBanner();
        renderMedications();
        renderAppointments();
        renderNotificationSection();
    }

    // Start periodic polling (every 60s) while page is open
    if (window.AHNotif) {
        AHNotif.startPolling(session.userId);
    }

    // Re-render when switching sections
    document.querySelectorAll('.nav-link[data-section]').forEach(link => {
        link.addEventListener('click', () => setTimeout(loadAll, 60));
    });

    loadAll();

    // ── Helpers ───────────────────────────────────────────────────────────
    function calcAdherence(patientId) {
        const doses = AH.getItem(AH.KEYS.DOSES)
            .filter(d => d.patientId === patientId && d.scheduledTime);
        const past = doses.filter(d => new Date(d.scheduledTime) <= new Date());
        if (!past.length) return 100;
        return Math.round(past.filter(d => d.takenAt).length / past.length * 100);
    }
    function adherenceClass(pct) { return pct >= 80 ? 'good' : pct >= 60 ? 'moderate' : 'poor'; }
    function adherenceLabel(pct) { return pct >= 80 ? '🟢 Good' : pct >= 60 ? '🟡 Moderate' : '🔴 Poor'; }
    function escHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function formatTime(date) { return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); }
    function emptyState(icon, msg) {
        return `<div class="empty-state"><div class="empty-icon">${icon}</div><p>${msg}</p></div>`;
    }
    function getDoctorName(doctorId) {
        const u = AH.getItem(AH.KEYS.USERS).find(u => u.id === doctorId);
        return u ? u.name : 'Unknown Doctor';
    }

    // ── Adherence Summary ─────────────────────────────────────────────────
    function renderAdherenceSummary() {
        const pct = calcAdherence(session.userId);
        const cls = adherenceClass(pct);
        const label = adherenceLabel(pct);

        const pctBigEl = document.getElementById('adherence-pct-big');
        const statusPill = document.querySelector('.status-pill');
        if (pctBigEl) pctBigEl.textContent = pct + '%';
        if (statusPill) statusPill.textContent = label;

        const insightEl = document.getElementById('adherence-insight');
        if (insightEl) {
            const msgs = {
                good: "Great job! You're consistently taking your medications. Keep it up! 🌟",
                moderate: "You're doing okay, but try not to miss doses. Set reminders to improve!",
                poor: "⚠️ Your adherence needs attention. Please contact your doctor or caregiver.",
            };
            insightEl.textContent = msgs[cls];
            insightEl.className = `badge badge-${cls} mt-8`;
        }
        renderTodayStats(pct, cls);
    }

    function renderTodayStats(pct, cls) {
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const todayEnd = new Date(todayStart.getTime() + 86400000);
        const doses = AH.getItem(AH.KEYS.DOSES).filter(d => {
            if (d.patientId !== session.userId) return false;
            const s = new Date(d.scheduledTime);
            return s >= todayStart && s < todayEnd;
        });
        const taken = doses.filter(d => d.takenAt).length;
        const missed = doses.filter(d => !d.takenAt && new Date(d.scheduledTime) < today).length;
        const upcoming = doses.filter(d => !d.takenAt && new Date(d.scheduledTime) >= today).length;
        const upAppts = AH.getItem(AH.KEYS.APPOINTMENTS)
            .filter(a => a.patientId === session.userId && new Date(a.datetime) >= today && !a.attended).length;

        const el = id => document.getElementById(id);
        if (el('stat-today-taken')) el('stat-today-taken').textContent = taken;
        if (el('stat-today-missed')) el('stat-today-missed').textContent = missed;
        if (el('stat-today-upcoming')) el('stat-today-upcoming').textContent = upcoming;
        if (el('stat-upcoming')) el('stat-upcoming').textContent = upAppts;
        if (el('stat-adherence')) el('stat-adherence').textContent = pct + '%';
        const bar = el('adh-bar-main');
        if (bar) { bar.style.width = pct + '%'; bar.className = `progress-bar progress-${cls}`; }
        if (el('adh-pct-big2')) el('adh-pct-big2').textContent = pct + '%';
        if (el('summary-status-pill')) el('summary-status-pill').textContent = adherenceLabel(pct);
        if (el('sum-taken')) el('sum-taken').textContent = taken;
        if (el('sum-missed')) el('sum-missed').textContent = missed;
        if (el('sum-upcoming')) el('sum-upcoming').textContent = upcoming;
        const emojis = { good: '🌟', moderate: '💪', poor: '⚠️' };
        const labels = { good: 'Good', moderate: 'Moderate', poor: 'Poor' };
        if (el('sum-emoji')) el('sum-emoji').textContent = emojis[cls] || '📊';
        if (el('sum-label')) { el('sum-label').textContent = labels[cls] || '-'; el('sum-label').className = `fw-700 text-${cls}`; }
        if (el('adherence-insight2')) {
            const msgs2 = { good: "Great job! Keep taking medications on time.", moderate: "Set reminders to improve your adherence!", poor: "⚠️ Please contact your doctor or caregiver." };
            el('adherence-insight2').textContent = msgs2[cls];
            el('adherence-insight2').className = `badge badge-${cls}`;
        }
    }

    // ── Overview Alert Banner ─────────────────────────────────────────────
    function renderOverviewAlertBanner() {
        const banner = document.getElementById('overview-alert-banner');
        if (!banner) return;
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(todayStart.getTime() + 86400000);
        const threshold = 30 * 60 * 1000;
        const missedToday = AH.getItem(AH.KEYS.DOSES).filter(d => {
            if (d.patientId !== session.userId || d.takenAt) return false;
            const s = new Date(d.scheduledTime);
            return s >= todayStart && s < todayEnd && (now - s) >= threshold;
        });
        if (!missedToday.length) { banner.style.display = 'none'; return; }
        const meds = AH.getItem(AH.KEYS.MEDICATIONS);
        const namesSet = new Set(missedToday.map(d => {
            const m = meds.find(m => m.id === d.medId); return m ? m.name : null;
        }).filter(Boolean));
        banner.style.display = 'flex';
        banner.innerHTML = `
            <span style="font-size:1.5rem">⚠️</span>
            <div>
                <strong>Missed Dose Alert!</strong>
                You have ${missedToday.length} overdue dose${missedToday.length > 1 ? 's' : ''} today:
                <em>${Array.from(namesSet).join(', ')}</em>. Emergency contacts & caregiver notified.
            </div>
            <button class="btn btn-outline btn-sm" style="flex-shrink:0;border-color:currentColor"
                onclick="document.querySelector('[data-section=section-alerts]').click()">View Alerts →</button>`;
    }

    // ── Medications ───────────────────────────────────────────────────────
    function renderMedications() {
        let meds = AH.getItem(AH.KEYS.MEDICATIONS).filter(m => m.patientId === session.userId);
        const doses = AH.getItem(AH.KEYS.DOSES).filter(d => d.patientId === session.userId);
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const todayEnd = new Date(todayStart.getTime() + 86400000);

        populateMedDoctorFilter(meds);
        if (_medDoctorFilter) meds = meds.filter(m => m.doctorId === _medDoctorFilter);

        const container = document.getElementById('med-list');
        if (!container) return;
        if (!meds.length) {
            container.innerHTML = emptyState('💊', _medDoctorFilter ? 'No medications from this doctor.' : 'No medications prescribed yet.');
            return;
        }
        container.innerHTML = meds.map(med => {
            const todayDoses = doses.filter(d => d.medId === med.id && new Date(d.scheduledTime) >= todayStart && new Date(d.scheduledTime) < todayEnd);
            const takenToday = todayDoses.filter(d => d.takenAt).length;
            const totalToday = todayDoses.length;
            const nextDue = todayDoses.find(d => !d.takenAt && new Date(d.scheduledTime) >= today);
            const allTakenToday = totalToday > 0 && takenToday === totalToday;
            const pastDoses = doses.filter(d => d.medId === med.id && new Date(d.scheduledTime) <= today);
            const medAdherence = pastDoses.length ? Math.round(pastDoses.filter(d => d.takenAt).length / pastDoses.length * 100) : 100;
            const cls = adherenceClass(medAdherence);
            const timeStr = nextDue ? formatTime(new Date(nextDue.scheduledTime)) : allTakenToday ? 'All doses taken ✓' : 'No doses today';
            const isOverdue = !nextDue && todayDoses.some(d => !d.takenAt && (today - new Date(d.scheduledTime)) >= 30 * 60 * 1000);
            return `
            <div class="med-card ${isOverdue ? 'med-overdue' : ''}" id="med-card-${med.id}">
                <div class="med-icon" style="background:${med.color}22;color:${med.color}">💊</div>
                <div class="med-info">
                    <div class="med-name">${escHtml(med.name)}</div>
                    <div class="med-detail">${escHtml(med.dosage)} · ${escHtml(med.frequency)}</div>
                    <div class="med-detail mt-4">
                        <span class="badge badge-${cls}" style="font-size:0.72rem">${medAdherence}% adherence</span>
                        <span style="margin-left:8px;color:var(--text-muted);font-size:0.78rem">Today: ${takenToday}/${totalToday}</span>
                    </div>
                    <div class="med-detail mt-4" style="color:var(--text-muted);font-size:0.78rem">⏰ ${timeStr}</div>
                    <div class="med-detail mt-4" style="font-size:0.75rem;color:var(--text-muted)">
                        👨‍⚕️ Prescribed by: <strong>${escHtml(getDoctorName(med.doctorId))}</strong>
                    </div>
                    ${isOverdue ? `<div style="font-size:0.75rem;color:var(--poor);margin-top:4px;font-weight:600">⚠️ Overdue — alerts sent to emergency contacts</div>` : ''}
                </div>
                <div class="progress-wrap" style="width:80px;height:8px;align-self:center;border-radius:99px;background:var(--surface2)">
                    <div class="progress-bar progress-${cls}" style="width:${medAdherence}%;height:100%;border-radius:99px"></div>
                </div>
                <div class="med-actions">
                    ${allTakenToday
                    ? `<div class="taken-badge">✔ Taken</div>`
                    : nextDue
                        ? `<button class="btn btn-primary btn-sm" onclick="markTaken('${nextDue.id}')">Mark as Taken</button>`
                        : `<div class="taken-badge" style="color:var(--text-muted);background:var(--surface2)">No dose due</div>`}
                </div>
            </div>`;
        }).join('');
    }

    function populateMedDoctorFilter(allMeds) {
        const sel = document.getElementById('med-doctor-filter');
        if (!sel) return;
        const doctorIds = [...new Set(allMeds.map(m => m.doctorId).filter(Boolean))];
        const current = sel.value;
        sel.innerHTML = `<option value="">All Doctors</option>` +
            doctorIds.map(id => `<option value="${id}" ${id === current ? 'selected' : ''}>${escHtml(getDoctorName(id))}</option>`).join('');
    }
    window.onMedDoctorFilterChange = val => { _medDoctorFilter = val; renderMedications(); };

    window.markTaken = function (doseId) {
        const doses = AH.getItem(AH.KEYS.DOSES);
        const idx = doses.findIndex(d => d.id === doseId);
        if (idx === -1) return;
        doses[idx].takenAt = new Date().toISOString();
        AH.setItem(AH.KEYS.DOSES, doses);
        AH.showToast('Medication marked as taken! 💊', 'success');
        loadAll();
    };

    // ── Appointments ──────────────────────────────────────────────────────
    function renderAppointments() {
        let appts = AH.getItem(AH.KEYS.APPOINTMENTS).filter(a => a.patientId === session.userId);
        const now = new Date();
        populateApptDoctorFilter(appts);
        if (_apptDoctorFilter) appts = appts.filter(a => a.doctorId === _apptDoctorFilter);

        const upcoming = appts.filter(a => new Date(a.datetime) >= now && !a.attended).sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
        const missed = appts.filter(a => new Date(a.datetime) < now && !a.attended).sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
        const attended = appts.filter(a => a.attended).sort((a, b) => new Date(b.datetime) - new Date(a.datetime));

        const el = id => document.getElementById(id);
        if (el('stat-upcoming')) el('stat-upcoming').textContent = upcoming.length;
        if (el('stat-upcoming2')) el('stat-upcoming2').textContent = upcoming.length;
        if (el('stat-missed')) el('stat-missed').textContent = missed.length;
        if (el('stat-attended')) el('stat-attended').textContent = attended.length;

        const upEl = el('upcoming-appts');
        const msEl = el('missed-appts');
        const atEl = el('attended-appts');
        if (upEl) upEl.innerHTML = upcoming.length ? upcoming.map(a => apptCard(a, 'upcoming')).join('') : emptyState('📅', 'No upcoming appointments.');
        if (msEl) msEl.innerHTML = missed.length ? missed.map(a => apptCard(a, 'missed')).join('') : emptyState('✅', 'No missed appointments!');
        if (atEl) atEl.innerHTML = attended.length ? attended.map(a => apptCard(a, 'attended')).join('') : emptyState('📋', 'No attended appointments yet.');
    }

    function populateApptDoctorFilter(allAppts) {
        const sel = document.getElementById('appt-doctor-filter');
        if (!sel) return;
        const doctorIds = [...new Set(allAppts.map(a => a.doctorId).filter(Boolean))];
        const current = sel.value;
        sel.innerHTML = `<option value="">All Doctors</option>` +
            doctorIds.map(id => `<option value="${id}" ${id === current ? 'selected' : ''}>${escHtml(getDoctorName(id))}</option>`).join('');
    }
    window.onApptDoctorFilterChange = val => { _apptDoctorFilter = val; renderAppointments(); };

    function apptCard(a, type) {
        const dt = new Date(a.datetime);
        const statusBadge = type === 'missed'
            ? `<span class="badge badge-poor" style="font-size:0.72rem">Missed</span>`
            : type === 'attended'
                ? `<span class="badge badge-good" style="font-size:0.72rem">✔ Attended</span>`
                : `<span class="badge badge-primary" style="font-size:0.72rem">Upcoming</span>`;
        return `
        <div class="appt-card ${type === 'missed' ? 'missed' : ''}" id="appt-${a.id}">
            <div class="appt-date-box"><div class="appt-day">${dt.getDate()}</div><div class="appt-month">${dt.toLocaleString('en', { month: 'short' })}</div></div>
            <div class="appt-info">
                <div class="appt-name">${escHtml(a.reason)}</div>
                <div class="appt-sub">🕐 ${formatTime(dt)} · ${dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                <div class="appt-sub" style="margin-top:4px">👨‍⚕️ ${escHtml(getDoctorName(a.doctorId))}</div>
                <div style="margin-top:6px">${statusBadge}</div>
            </div>
            ${type !== 'attended' ? `<div style="flex-shrink:0"><button class="btn btn-accent btn-sm" onclick="markAttended('${a.id}')">Mark Attended</button></div>` : ''}
        </div>`;
    }

    window.markAttended = function (apptId) {
        const appts = AH.getItem(AH.KEYS.APPOINTMENTS);
        const idx = appts.findIndex(a => a.id === apptId);
        if (idx === -1) return;
        appts[idx].attended = true;
        AH.setItem(AH.KEYS.APPOINTMENTS, appts);
        AH.showToast('Appointment marked as attended! ✅', 'success');
        renderAppointments();
    };

    // ── Notification & Alert Section ──────────────────────────────────────
    function renderNotificationSection() {
        if (!window.AHNotif) return;
        AHNotif.renderNotifications(session.userId);
        AHNotif.renderEmergencyContacts(session.userId);
        AHNotif.updateBadge(session.userId);
        AHNotif.renderAlertHistory(session.userId);
        populateCaregiverDropdown();
        updateCaregiverDisplay();
    }

    // ── Emergency Contact – Add Form ──────────────────────────────────────
    const ecForm = document.getElementById('ec-add-form');
    if (ecForm) {
        const phoneInput = document.getElementById('ec-phone');
        const phoneError = document.getElementById('ec-phone-error');
        const primaryCheck = document.getElementById('ec-primary');

        // Real-time phone validation feedback
        if (phoneInput && phoneError) {
            phoneInput.addEventListener('input', () => {
                const val = phoneInput.value.trim();
                if (!val) { phoneError.textContent = ''; return; }
                const valid = window.AHNotif ? AHNotif.validatePhone(val) : true;
                phoneError.textContent = valid ? '' : '⚠ Invalid format. Use: +1-555-0101 or +919876543210';
                phoneError.style.color = 'var(--poor)';
            });
        }

        ecForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const name = document.getElementById('ec-name').value.trim();
            const relation = document.getElementById('ec-relation').value.trim();
            const phone = document.getElementById('ec-phone').value.trim();
            const primary = document.getElementById('ec-primary')?.checked || false;

            if (!window.AHNotif) return;
            const res = AHNotif.addContact(session.userId, name, relation, phone, primary);
            if (!res.ok) {
                AH.showToast(res.error, 'error');
                if (phoneError) { phoneError.textContent = res.error; phoneError.style.color = 'var(--poor)'; }
                return;
            }
            AHNotif.renderEmergencyContacts(session.userId);
            ecForm.reset();
            if (phoneError) phoneError.textContent = '';
            AH.showToast(`${name} added as emergency contact! 📞`, 'success');
        });
    }

    // ── Emergency Contact – Edit Modal ────────────────────────────────────
    const ecEditForm = document.getElementById('ec-edit-form');
    if (ecEditForm) {
        const editPhoneError = document.getElementById('ec-edit-phone-error');
        const editPhoneInput = document.getElementById('ec-edit-phone');

        if (editPhoneInput && editPhoneError) {
            editPhoneInput.addEventListener('input', () => {
                const val = editPhoneInput.value.trim();
                if (!val) { editPhoneError.textContent = ''; return; }
                const valid = window.AHNotif ? AHNotif.validatePhone(val) : true;
                editPhoneError.textContent = valid ? '' : '⚠ Invalid format.';
                editPhoneError.style.color = 'var(--poor)';
            });
        }

        ecEditForm.addEventListener('submit', function (e) {
            e.preventDefault();
            const id = document.getElementById('ec-edit-id').value;
            const pid = document.getElementById('ec-edit-pid').value;
            const name = document.getElementById('ec-edit-name').value.trim();
            const relation = document.getElementById('ec-edit-relation').value.trim();
            const phone = document.getElementById('ec-edit-phone').value.trim();
            const primary = document.getElementById('ec-edit-primary')?.checked || false;

            if (!window.AHNotif) return;
            const res = AHNotif.updateContact(id, { name, relation, phone, isPrimary: primary });
            if (!res.ok) { AH.showToast(res.error, 'error'); return; }
            AHNotif.renderEmergencyContacts(pid);
            document.getElementById('ec-edit-modal')?.classList.remove('open');
            AH.showToast('Contact updated successfully! ✅', 'success');
        });
    }

    // Close edit modal
    window.closeEditModal = () => document.getElementById('ec-edit-modal')?.classList.remove('open');

    // ── Mark All Read & Clear Notifications ───────────────────────────────
    document.getElementById('btn-mark-all-read')?.addEventListener('click', () => {
        if (window.AHNotif) { AHNotif.markAllRead(session.userId); AHNotif.renderNotifications(session.userId); }
    });
    document.getElementById('btn-clear-notifs')?.addEventListener('click', () => {
        if (!confirm('Clear all notifications?')) return;
        if (window.AHNotif) { AHNotif.clearAllNotifications(session.userId); AHNotif.renderNotifications(session.userId); }
    });
    document.getElementById('btn-ack-all-logs')?.addEventListener('click', () => {
        if (window.AHNotif) AHNotif.acknowledgeAllLogs(session.userId);
    });

    // ── Caregiver Assignment ──────────────────────────────────────────────
    function populateCaregiverDropdown() {
        const sel = document.getElementById('caregiver-assign-select');
        if (!sel) return;
        const caregivers = AH.getItem(AH.KEYS.USERS).filter(u => u.role === 'caregiver');
        const current = window.AHNotif ? AHNotif.getAssignedCaregiver(session.userId) : null;
        sel.innerHTML = `<option value="">No Caregiver Assigned</option>` +
            caregivers.map(c => `<option value="${c.id}" ${current && c.id === current.id ? 'selected' : ''}>${escHtml(c.name)}</option>`).join('');
    }

    function updateCaregiverDisplay() {
        const displayEl = document.getElementById('assigned-caregiver-display');
        if (!displayEl || !window.AHNotif) return;
        const cg = AHNotif.getAssignedCaregiver(session.userId);
        displayEl.innerHTML = cg
            ? `<span class="badge badge-good">✓ ${escHtml(cg.name)} assigned — will receive missed-dose alerts</span>`
            : `<span style="color:var(--text-muted);font-size:0.85rem">No caregiver assigned yet.</span>`;
    }

    document.getElementById('btn-assign-caregiver')?.addEventListener('click', () => {
        const sel = document.getElementById('caregiver-assign-select');
        if (!sel || !window.AHNotif) return;
        AHNotif.assignCaregiver(session.userId, sel.value || null);
        updateCaregiverDisplay();
        AH.showToast(sel.value ? 'Caregiver assigned! They will be notified on missed doses. 🏥' : 'Caregiver assignment cleared.', 'success');
    });

    // ── Alert History tabs (Notifications / History) ──────────────────────
    document.querySelectorAll('.alert-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.alert-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.alert-tab-panel').forEach(p => p.style.display = 'none');
            btn.classList.add('active');
            const target = btn.dataset.alertTab;
            const panel = document.getElementById(target);
            if (panel) panel.style.display = 'block';
        });
    });

});
