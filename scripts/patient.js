/**
 * AfterHeal – patient.js
 * Patient Dashboard: Medication tracker, appointments, adherence summary
 */

document.addEventListener('DOMContentLoaded', () => {
    // ── Auth guard ──
    const session = AH.requireAuth('patient');
    if (!session) return;

    AH.populateSidebarUser(session);
    AH.setTopbarDate();
    AH.initSidebarToggle();
    AH.initLogout();
    AH.initNavLinks();

    loadAll();

    // Refresh view when user marks something
    function loadAll() {
        renderAdherenceSummary();
        renderMedications();
        renderAppointments();
    }

    // ── Adherence calculation ─────────────────────────────
    function calcAdherence(patientId) {
        const doses = AH.getItem(AH.KEYS.DOSES).filter(d => d.patientId === patientId && d.scheduledTime);
        const past = doses.filter(d => new Date(d.scheduledTime) <= new Date());
        if (!past.length) return 100;
        const taken = past.filter(d => d.takenAt).length;
        return Math.round((taken / past.length) * 100);
    }

    function adherenceClass(pct) {
        if (pct >= 80) return 'good';
        if (pct >= 60) return 'moderate';
        return 'poor';
    }
    function adherenceLabel(pct) {
        if (pct >= 80) return '🟢 Good';
        if (pct >= 60) return '🟡 Moderate';
        return '🔴 Poor';
    }

    // ── Adherence Summary Widget ──────────────────────────
    function renderAdherenceSummary() {
        const pct = calcAdherence(session.userId);
        const cls = adherenceClass(pct);
        const label = adherenceLabel(pct);

        const pctBig = AH.$('.adherence-pct') || AH.$('#adherence-pct-big');
        const statBadge = AH.$('.status-pill');
        const bar = AH.$('.progress-bar');

        if (pctBig) pctBig.textContent = pct + '%';
        if (statBadge) statBadge.textContent = label;
        if (bar) {
            bar.style.width = pct + '%';
            bar.className = `progress-bar progress-${cls}`;
        }

        // update stat cards if present
        const statAdherence = document.getElementById('stat-adherence');
        if (statAdherence) statAdherence.textContent = pct + '%';

        // Insight text
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

        // Today's stats
        renderTodayStats();
    }

    function renderTodayStats() {
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const doses = AH.getItem(AH.KEYS.DOSES).filter(d => {
            if (d.patientId !== session.userId) return false;
            const s = new Date(d.scheduledTime);
            return s >= todayStart && s < new Date(todayStart.getTime() + 86400000);
        });

        const total = doses.length;
        const taken = doses.filter(d => d.takenAt).length;
        const missed = doses.filter(d => !d.takenAt && new Date(d.scheduledTime) < today).length;
        const upcoming = doses.filter(d => !d.takenAt && new Date(d.scheduledTime) >= today).length;

        const el = (id) => document.getElementById(id);
        if (el('stat-today-taken')) el('stat-today-taken').textContent = taken;
        if (el('stat-today-missed')) el('stat-today-missed').textContent = missed;
        if (el('stat-today-upcoming')) el('stat-today-upcoming').textContent = upcoming;
        if (el('stat-today-total')) el('stat-today-total').textContent = total;
    }

    // ── Medications ───────────────────────────────────────
    function renderMedications() {
        const meds = AH.getItem(AH.KEYS.MEDICATIONS).filter(m => m.patientId === session.userId);
        const doses = AH.getItem(AH.KEYS.DOSES).filter(d => d.patientId === session.userId);
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const todayEnd = new Date(todayStart.getTime() + 86400000);

        const container = document.getElementById('med-list');
        if (!container) return;

        if (!meds.length) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">💊</div><p>No medications prescribed yet.<br>Ask your doctor to add your prescription.</p></div>`;
            return;
        }

        container.innerHTML = meds.map(med => {
            // Today's doses for this med
            const todayDoses = doses.filter(d => d.medId === med.id && new Date(d.scheduledTime) >= todayStart && new Date(d.scheduledTime) < todayEnd);
            const takenToday = todayDoses.filter(d => d.takenAt).length;
            const totalToday = todayDoses.length;
            const nextDue = todayDoses.find(d => !d.takenAt && new Date(d.scheduledTime) >= today);
            const allTakenToday = totalToday > 0 && takenToday === totalToday;

            // Overall adherence for this med
            const pastDoses = doses.filter(d => d.medId === med.id && new Date(d.scheduledTime) <= today);
            const medAdherence = pastDoses.length ? Math.round((pastDoses.filter(d => d.takenAt).length / pastDoses.length) * 100) : 100;
            const cls = adherenceClass(medAdherence);

            const timeStr = nextDue ? formatTime(new Date(nextDue.scheduledTime)) : (allTakenToday ? 'All doses taken ✓' : 'No doses today');

            return `
      <div class="med-card" id="med-card-${med.id}">
        <div class="med-icon" style="background:${med.color}22; color:${med.color}">💊</div>
        <div class="med-info">
          <div class="med-name">${escHtml(med.name)}</div>
          <div class="med-detail">${escHtml(med.dosage)} · ${escHtml(med.frequency)}</div>
          <div class="med-detail mt-4">
            <span class="badge badge-${cls}" style="font-size:0.72rem">${medAdherence}% adherence</span>
            <span style="margin-left:8px; color:var(--text-muted); font-size:0.78rem">Today: ${takenToday}/${totalToday} taken</span>
          </div>
          <div class="med-detail mt-4" style="color:var(--text-muted); font-size:0.78rem">⏰ ${timeStr}</div>
        </div>
        <div class="progress-wrap" style="width:80px; height:8px; align-self:center; display:inline-block; border-radius:99px; background:var(--surface2);">
          <div class="progress-bar progress-${cls}" style="width:${medAdherence}%; height:100%; border-radius:99px;"></div>
        </div>
        <div class="med-actions">
          ${allTakenToday
                    ? `<div class="taken-badge">✔ Taken</div>`
                    : nextDue
                        ? `<button class="btn btn-primary btn-sm" onclick="markTaken('${nextDue.id}')">Mark as Taken</button>`
                        : `<div class="taken-badge" style="color:var(--text-muted); background:var(--surface2)">No dose due</div>`
                }
        </div>
      </div>`;
        }).join('');
    }

    // ── Mark Taken ────────────────────────────────────────
    window.markTaken = function (doseId) {
        const doses = AH.getItem(AH.KEYS.DOSES);
        const idx = doses.findIndex(d => d.id === doseId);
        if (idx === -1) return;
        doses[idx].takenAt = new Date().toISOString();
        AH.setItem(AH.KEYS.DOSES, doses);
        AH.showToast('Medication marked as taken! 💊', 'success');
        loadAll();
    };

    // ── Appointments ──────────────────────────────────────
    function renderAppointments() {
        const appts = AH.getItem(AH.KEYS.APPOINTMENTS).filter(a => a.patientId === session.userId);
        const now = new Date();

        const upcoming = appts.filter(a => new Date(a.datetime) >= now && !a.attended).sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
        const missed = appts.filter(a => new Date(a.datetime) < now && !a.attended).sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
        const attended = appts.filter(a => a.attended).sort((a, b) => new Date(b.datetime) - new Date(a.datetime));

        const upEl = document.getElementById('upcoming-appts');
        const msEl = document.getElementById('missed-appts');
        const atEl = document.getElementById('attended-appts');

        // Stat counters
        const el = (id) => document.getElementById(id);
        if (el('stat-upcoming')) el('stat-upcoming').textContent = upcoming.length;
        if (el('stat-missed')) el('stat-missed').textContent = missed.length;
        if (el('stat-attended')) el('stat-attended').textContent = attended.length;

        if (upEl) upEl.innerHTML = upcoming.length
            ? upcoming.map(a => apptCard(a, 'upcoming')).join('')
            : emptyState('📅', 'No upcoming appointments.');

        if (msEl) msEl.innerHTML = missed.length
            ? missed.map(a => apptCard(a, 'missed')).join('')
            : emptyState('✅', 'No missed appointments!');

        if (atEl) atEl.innerHTML = attended.length
            ? attended.map(a => apptCard(a, 'attended')).join('')
            : emptyState('📋', 'No attended appointments yet.');
    }

    function apptCard(a, type) {
        const dt = new Date(a.datetime);
        const day = dt.getDate();
        const mon = dt.toLocaleString('en', { month: 'short' });
        const time = formatTime(dt);
        const isMissed = type === 'missed';
        return `
    <div class="appt-card ${isMissed ? 'missed' : ''}" id="appt-${a.id}">
      <div class="appt-date-box">
        <div class="appt-day">${day}</div>
        <div class="appt-month">${mon}</div>
      </div>
      <div class="appt-info">
        <div class="appt-name">${escHtml(a.reason)}</div>
        <div class="appt-sub">🕐 ${time} · ${dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
        ${isMissed ? `<span class="badge badge-poor" style="margin-top:6px; font-size:0.72rem">Missed</span>` : ''}
        ${type === 'attended' ? `<span class="badge badge-good" style="margin-top:6px; font-size:0.72rem">✔ Attended</span>` : ''}
      </div>
      ${type !== 'attended'
                ? `<div style="flex-shrink:0"><button class="btn btn-accent btn-sm" onclick="markAttended('${a.id}')">Mark Attended</button></div>`
                : ''}
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

    // ── Utility ────────────────────────────────────────────
    function formatTime(date) {
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    function emptyState(icon, msg) {
        return `<div class="empty-state"><div class="empty-icon">${icon}</div><p>${msg}</p></div>`;
    }
    function escHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
});
