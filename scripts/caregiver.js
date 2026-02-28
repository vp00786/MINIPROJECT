/**
 * AfterHeal – caregiver.js
 * Caregiver Dashboard: Patient overview, missed dose alerts, support log
 */

document.addEventListener('DOMContentLoaded', () => {
    const session = AH.requireAuth('caregiver');
    if (!session) return;

    AH.populateSidebarUser(session);
    AH.setTopbarDate();
    AH.initSidebarToggle();
    AH.initLogout();
    AH.initNavLinks();

    loadAll();
    initSupportLogForm();

    function loadAll() {
        renderStats();
        renderPatientOverview();
        renderMissedDoseAlerts();
        renderSupportLog();
    }

    // ── Get assigned patients (all patients for demo) ────
    function getAssignedPatients() {
        // In a real app, would filter by caregiverId assignment.
        // For demo, caregiver sees all patients.
        return AH.getItem(AH.KEYS.USERS).filter(u => u.role === 'patient');
    }

    function calcAdherence(pid) {
        const doses = AH.getItem(AH.KEYS.DOSES).filter(d => d.patientId === pid);
        const past = doses.filter(d => new Date(d.scheduledTime) <= new Date());
        if (!past.length) return 100;
        return Math.round(past.filter(d => d.takenAt).length / past.length * 100);
    }
    function adherenceClass(p) { return p >= 80 ? 'good' : p >= 60 ? 'moderate' : 'poor'; }
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function fmtTime(iso) { return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); }
    function fmtDT(iso) { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }

    const COLORS = ['#3B91E2', '#00C9A0', '#6C5CE7', '#F0A500', '#E74C3C', '#00B894'];

    // ── Stats ─────────────────────────────────────────────
    function renderStats() {
        const pts = getAssignedPatients();
        const doses = AH.getItem(AH.KEYS.DOSES);
        const now = new Date();
        const missed = doses.filter(d => pts.some(p => p.id === d.patientId) && !d.takenAt && new Date(d.scheduledTime) < now).length;
        const adhs = pts.map(p => calcAdherence(p.id));
        const avg = adhs.length ? Math.round(adhs.reduce((s, v) => s + v, 0) / adhs.length) : 0;
        const el = id => document.getElementById(id);
        if (el('stat-assigned')) el('stat-assigned').textContent = pts.length;
        if (el('stat-missed-d')) el('stat-missed-d').textContent = missed;
        if (el('stat-avg-adh')) el('stat-avg-adh').textContent = avg + '%';
        if (el('stat-logs')) el('stat-logs').textContent = AH.getItem(AH.KEYS.SUPPORT_LOG).filter(l => l.caregiverId === session.userId).length;
    }

    // ── Patient Overview ──────────────────────────────────
    function renderPatientOverview() {
        const pts = getAssignedPatients();
        const con = document.getElementById('patient-overview');
        if (!con) return;
        if (!pts.length) { con.innerHTML = `<div class="empty-state"><div class="empty-icon">👤</div><p>No patients assigned.</p></div>`; return; }
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(todayStart.getTime() + 86400000);

        con.innerHTML = pts.map((p, i) => {
            const pct = calcAdherence(p.id);
            const cls = adherenceClass(pct);
            const meds = AH.getItem(AH.KEYS.MEDICATIONS).filter(m => m.patientId === p.id);
            const allDoses = AH.getItem(AH.KEYS.DOSES).filter(d => d.patientId === p.id && new Date(d.scheduledTime) >= todayStart && new Date(d.scheduledTime) < todayEnd);
            const taken = allDoses.filter(d => d.takenAt).length;
            const total = allDoses.length;
            const nextDue = allDoses.find(d => !d.takenAt && new Date(d.scheduledTime) >= now);
            return `
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:16px">
          <div class="patient-avatar" style="background:${COLORS[i % COLORS.length]};width:46px;height:46px">${p.name.charAt(0)}</div>
          <div style="flex:1">
            <div class="patient-name">${esc(p.name)}</div>
            <div class="patient-email">${esc(p.email)}</div>
          </div>
          <span class="badge badge-${cls}">${pct}% adherence</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px">
          <div style="text-align:center;background:var(--surface2);border-radius:8px;padding:10px">
            <div style="font-size:1.3rem;font-weight:800;color:var(--primary)">${meds.length}</div>
            <div style="font-size:0.73rem;color:var(--text-muted)">Medications</div>
          </div>
          <div style="text-align:center;background:var(--surface2);border-radius:8px;padding:10px">
            <div style="font-size:1.3rem;font-weight:800;color:var(--good)">${taken}/${total}</div>
            <div style="font-size:0.73rem;color:var(--text-muted)">Today's Doses</div>
          </div>
          <div style="text-align:center;background:var(--surface2);border-radius:8px;padding:10px">
            <div style="font-size:1rem;font-weight:700;color:var(--moderate)">${nextDue ? fmtTime(nextDue.scheduledTime) : 'All done ✓'}</div>
            <div style="font-size:0.73rem;color:var(--text-muted)">Next Due</div>
          </div>
        </div>
        <div class="progress-wrap" style="margin-bottom:12px"><div class="progress-bar progress-${cls}" style="width:${pct}%"></div></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline btn-sm" onclick="showMedSchedule('${p.id}','${esc(p.name)}')">View Schedule</button>
          <button class="btn btn-accent btn-sm" onclick="openLogForm('${p.id}','${esc(p.name)}')">+ Log Support</button>
        </div>
      </div>`;
        }).join('');
    }

    // ── Med Schedule Modal ────────────────────────────────
    window.showMedSchedule = function (pid, pname) {
        const meds = AH.getItem(AH.KEYS.MEDICATIONS).filter(m => m.patientId === pid);
        const doses = AH.getItem(AH.KEYS.DOSES).filter(d => d.patientId === pid);
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(todayStart.getTime() + 86400000);

        document.getElementById('schedule-modal-title').textContent = `${pname}'s Medication Schedule`;
        const con = document.getElementById('schedule-content');
        if (!con) return;

        if (!meds.length) { con.innerHTML = `<p class="text-muted" style="font-size:0.85rem">No medications prescribed.</p>`; openModal('schedule-modal'); return; }

        con.innerHTML = meds.map(m => {
            const todayDoses = doses.filter(d => d.medId === m.id && new Date(d.scheduledTime) >= todayStart && new Date(d.scheduledTime) < todayEnd);
            const past = doses.filter(d => d.medId === m.id && new Date(d.scheduledTime) <= now);
            const adh = past.length ? Math.round(past.filter(d => d.takenAt).length / past.length * 100) : 100;
            const cls = adherenceClass(adh);
            return `
      <div class="med-card" style="margin-bottom:10px;padding:14px 16px">
        <div class="med-icon" style="width:38px;height:38px;font-size:1rem">💊</div>
        <div class="med-info">
          <div class="med-name" style="font-size:0.9rem">${esc(m.name)}</div>
          <div class="med-detail">${esc(m.dosage)} · ${esc(m.frequency)}</div>
          <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
            ${todayDoses.map(d => `<span class="badge badge-${d.takenAt ? 'good' : new Date(d.scheduledTime) < now ? 'poor' : 'primary'}" style="font-size:0.7rem">${fmtTime(d.scheduledTime)} ${d.takenAt ? '✓ Taken' : new Date(d.scheduledTime) < now ? 'Missed' : 'Pending'}</span>`).join('')}
          </div>
        </div>
        <span class="badge badge-${cls}">${adh}%</span>
      </div>`;
        }).join('');
        openModal('schedule-modal');
    };

    // ── Missed Dose Alerts ────────────────────────────────
    function renderMissedDoseAlerts() {
        const pts = getAssignedPatients();
        const now = new Date();
        const allDoses = AH.getItem(AH.KEYS.DOSES);
        const allMeds = AH.getItem(AH.KEYS.MEDICATIONS);

        const missed = [];
        pts.forEach(p => {
            allDoses.filter(d => d.patientId === p.id && !d.takenAt && new Date(d.scheduledTime) < now).forEach(d => {
                const med = allMeds.find(m => m.id === d.medId);
                if (med) missed.push({ patient: p, dose: d, med });
            });
        });

        missed.sort((a, b) => new Date(b.dose.scheduledTime) - new Date(a.dose.scheduledTime));

        const con = document.getElementById('missed-alerts');
        if (!con) return;

        const badge = document.getElementById('nav-alert-badge');
        if (badge) badge.textContent = missed.length || '';

        if (!missed.length) {
            con.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><p>No missed doses — great work!</p></div>`; return;
        }

        con.innerHTML = missed.slice(0, 20).map(({ patient, dose, med }) => `
    <div class="alert-banner">
      <div class="banner-icon">⚠️</div>
      <div class="banner-text" style="flex:1">
        <strong>${esc(patient.name)}</strong> missed <strong>${esc(med.name)} ${esc(med.dosage)}</strong>
        <br><span style="font-size:0.78rem;color:var(--text-muted)">Due: ${fmtDT(dose.scheduledTime)}</span>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="markDoseTaken('${dose.id}')">Mark Taken</button>
    </div>`).join('');
    }

    window.markDoseTaken = function (doseId) {
        const doses = AH.getItem(AH.KEYS.DOSES);
        const idx = doses.findIndex(d => d.id === doseId);
        if (idx !== -1) { doses[idx].takenAt = new Date().toISOString(); AH.setItem(AH.KEYS.DOSES, doses); }
        AH.showToast('Dose marked as taken! 💊', 'success');
        loadAll();
    };

    // ── Support Log ───────────────────────────────────────
    window.openLogForm = function (pid, pname) {
        const el = id => document.getElementById(id);
        if (el('log-patient-id')) el('log-patient-id').value = pid;
        if (el('log-patient-name')) el('log-patient-name').textContent = pname;
        if (el('log-note')) el('log-note').value = '';
        openModal('log-modal');
    };

    function initSupportLogForm() {
        const form = document.getElementById('log-form');
        if (!form) return;

        // Quick log section patient select
        const sel = document.getElementById('log-select-patient');
        if (sel) sel.innerHTML = `<option value="">Select patient...</option>` +
            getAssignedPatients().map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            const pid = (document.getElementById('log-patient-id')?.value || document.getElementById('log-select-patient')?.value || '').trim();
            const note = document.getElementById('log-note').value.trim();
            if (!pid || !note) { AH.showToast('Select patient and enter a note.', 'error'); return; }

            const log = AH.getItem(AH.KEYS.SUPPORT_LOG);
            log.unshift({ id: AH.uuid(), caregiverId: session.userId, patientId: pid, note, timestamp: new Date().toISOString() });
            AH.setItem(AH.KEYS.SUPPORT_LOG, log);
            AH.showToast('Support note logged! 📝', 'success');
            closeModal('log-modal');
            form.reset();
            loadAll();
        });

        // Quick note form (on page, not modal)
        const qForm = document.getElementById('quick-log-form');
        if (qForm) {
            const qSel = document.getElementById('quick-log-patient');
            if (qSel) qSel.innerHTML = `<option value="">Select patient...</option>` +
                getAssignedPatients().map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
            qForm.addEventListener('submit', function (e) {
                e.preventDefault();
                const pid = document.getElementById('quick-log-patient').value;
                const note = document.getElementById('quick-log-note').value.trim();
                if (!pid || !note) { AH.showToast('Fill in all fields.', 'error'); return; }
                const log = AH.getItem(AH.KEYS.SUPPORT_LOG);
                log.unshift({ id: AH.uuid(), caregiverId: session.userId, patientId: pid, note, timestamp: new Date().toISOString() });
                AH.setItem(AH.KEYS.SUPPORT_LOG, log);
                AH.showToast('Note added! 📝', 'success');
                qForm.reset();
                renderSupportLog();
                renderStats();
            });
        }
    }

    function renderSupportLog() {
        const logs = AH.getItem(AH.KEYS.SUPPORT_LOG).filter(l => l.caregiverId === session.userId);
        const pts = AH.getItem(AH.KEYS.USERS);
        const con = document.getElementById('support-log');
        if (!con) return;
        if (!logs.length) { con.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>No support log entries yet.</p></div>`; return; }
        con.innerHTML = logs.map(l => {
            const patient = pts.find(p => p.id === l.patientId);
            return `
      <div class="log-entry">
        <div class="log-entry-header">
          <span class="log-entry-caregiver">For: ${patient ? esc(patient.name) : esc(l.patientId)}</span>
          <span class="log-entry-time">${fmtDT(l.timestamp)}</span>
        </div>
        <div class="log-entry-note">${esc(l.note)}</div>
      </div>`;
        }).join('');
    }

    // ── Modal helpers ─────────────────────────────────────
    function openModal(id) { document.getElementById(id)?.classList.add('open'); }
    window.closeModal = function (id) { document.getElementById(id)?.classList.remove('open'); };
    document.querySelectorAll('.modal-overlay').forEach(el => {
        el.addEventListener('click', function (e) { if (e.target === this) this.classList.remove('open'); });
    });
});
