/**
 * AfterHeal – doctor.js
 * Doctor Dashboard: Patient management, prescriptions, adherence monitoring
 */

document.addEventListener('DOMContentLoaded', () => {
    const session = AH.requireAuth('doctor');
    if (!session) return;

    AH.populateSidebarUser(session);
    AH.setTopbarDate();
    AH.initSidebarToggle();
    AH.initLogout();
    AH.initNavLinks();

    loadAll();
    initPrescriptionForm();
    initAddAppointmentForm();

    function loadAll() {
        renderStats();
        renderPatientList();
        renderAllPatientAdherence();
    }

    // ── Helpers ──────────────────────────────────────────
    function getPatients() { return AH.getItem(AH.KEYS.USERS).filter(u => u.role === 'patient'); }
    function getMedsForPatient(pid) { return AH.getItem(AH.KEYS.MEDICATIONS).filter(m => m.patientId === pid); }
    function calcAdherence(pid) {
        const doses = AH.getItem(AH.KEYS.DOSES).filter(d => d.patientId === pid);
        const past = doses.filter(d => new Date(d.scheduledTime) <= new Date());
        if (!past.length) return 100;
        return Math.round(past.filter(d => d.takenAt).length / past.length * 100);
    }
    function adherenceClass(p) { return p >= 80 ? 'good' : p >= 60 ? 'moderate' : 'poor'; }
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function fmtDT(iso) { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }

    const COLORS = ['#3B91E2', '#00C9A0', '#6C5CE7', '#F0A500', '#E74C3C', '#00B894'];

    // ── Stats ─────────────────────────────────────────────
    function renderStats() {
        const pts = getPatients();
        const meds = AH.getItem(AH.KEYS.MEDICATIONS);
        const adhs = pts.map(p => calcAdherence(p.id));
        const poor = adhs.filter(a => a < 60).length;
        const avg = adhs.length ? Math.round(adhs.reduce((s, v) => s + v, 0) / adhs.length) : 0;
        const el = id => document.getElementById(id);
        if (el('stat-patients')) el('stat-patients').textContent = pts.length;
        if (el('stat-meds-total')) el('stat-meds-total').textContent = meds.filter(m => m.doctorId === session.userId).length;
        if (el('stat-poor')) el('stat-poor').textContent = poor;
        if (el('stat-avg-adh')) el('stat-avg-adh').textContent = avg + '%';
    }

    // ── Patient List ──────────────────────────────────────
    function renderPatientList() {
        const pts = getPatients();
        const con = document.getElementById('patient-list');
        if (!con) return;
        if (!pts.length) { con.innerHTML = `<div class="empty-state"><div class="empty-icon">👤</div><p>No patients registered yet.</p></div>`; return; }

        con.innerHTML = pts.map((p, i) => {
            const pct = calcAdherence(p.id);
            const cls = adherenceClass(pct);
            const meds = getMedsForPatient(p.id).length;
            return `
      <div class="patient-row">
        <div class="patient-avatar" style="background:${COLORS[i % COLORS.length]}">${p.name.charAt(0)}</div>
        <div class="patient-info">
          <div class="patient-name">${esc(p.name)}</div>
          <div class="patient-email">${esc(p.email)} · ${meds} medication${meds !== 1 ? 's' : ''}</div>
          <div class="progress-wrap mt-8" style="max-width:180px"><div class="progress-bar progress-${cls}" style="width:${pct}%"></div></div>
        </div>
        <div class="patient-adherence">
          <div class="adherence-pct text-${cls}">${pct}%</div>
          <span class="badge badge-${cls}">${cls.charAt(0).toUpperCase() + cls.slice(1)}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
          <button class="btn btn-outline btn-sm" onclick="showPatientDetail('${p.id}')">View Details</button>
          <button class="btn btn-primary btn-sm" onclick="openRxForm('${p.id}','${esc(p.name)}')">+ Prescribe</button>
        </div>
      </div>`;
        }).join('');
    }

    // ── Patient Detail Modal ──────────────────────────────
    window.showPatientDetail = function (pid) {
        const p = AH.getItem(AH.KEYS.USERS).find(u => u.id === pid);
        if (!p) return;
        const meds = getMedsForPatient(pid);
        const doses = AH.getItem(AH.KEYS.DOSES).filter(d => d.patientId === pid);
        const appts = AH.getItem(AH.KEYS.APPOINTMENTS).filter(a => a.patientId === pid).sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
        const pct = calcAdherence(pid);
        const cls = adherenceClass(pct);

        document.getElementById('detail-patient-name').textContent = p.name;
        const pctEl = document.getElementById('detail-adherence-pct');
        if (pctEl) { pctEl.textContent = pct + '%'; pctEl.className = `text-${cls}`; }

        const medsEl = document.getElementById('detail-meds');
        if (medsEl) medsEl.innerHTML = meds.length ? meds.map(m => {
            const past = doses.filter(d => d.medId === m.id && new Date(d.scheduledTime) <= new Date());
            const adh = past.length ? Math.round(past.filter(d => d.takenAt).length / past.length * 100) : 100;
            const mc = adherenceClass(adh);
            return `<div class="med-card" style="padding:12px 16px;margin-bottom:8px">
        <div class="med-icon" style="width:36px;height:36px;font-size:1rem">💊</div>
        <div class="med-info"><div class="med-name" style="font-size:0.9rem">${esc(m.name)}</div>
        <div class="med-detail">${esc(m.dosage)} · ${esc(m.frequency)}</div></div>
        <span class="badge badge-${mc}">${adh}%</span>
        <button class="btn btn-danger btn-sm" onclick="deleteMed('${m.id}','${pid}')">Remove</button>
      </div>`;
        }).join('') : `<p class="text-muted" style="font-size:0.85rem">No medications prescribed.</p>`;

        const apptEl = document.getElementById('detail-appts');
        if (apptEl) apptEl.innerHTML = appts.length ? appts.map(a => {
            const status = a.attended ? 'good' : new Date(a.datetime) < new Date() ? 'poor' : 'primary';
            const label = a.attended ? 'Attended' : new Date(a.datetime) < new Date() ? 'Missed' : 'Upcoming';
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
        <div><div style="font-size:0.88rem;font-weight:600">${esc(a.reason)}</div>
        <div style="font-size:0.75rem;color:var(--text-muted)">${fmtDT(a.datetime)}</div></div>
        <span class="badge badge-${status}">${label}</span></div>`;
        }).join('') : `<p class="text-muted" style="font-size:0.85rem">No appointments.</p>`;

        openModal('patient-detail-modal');
    };

    window.deleteMed = function (medId, pid) {
        if (!confirm('Remove this medication?')) return;
        AH.setItem(AH.KEYS.MEDICATIONS, AH.getItem(AH.KEYS.MEDICATIONS).filter(m => m.id !== medId));
        AH.showToast('Medication removed.', 'warning');
        loadAll();
        showPatientDetail(pid);
    };

    // ── Prescription Form ─────────────────────────────────
    window.openRxForm = function (pid, pname) {
        const pidEl = document.getElementById('rx-patient-id');
        const nameEl = document.getElementById('rx-patient-name');
        document.getElementById('rx-form').reset();
        if (pidEl) pidEl.value = pid;
        if (nameEl) nameEl.textContent = pname;
        openModal('rx-modal');
    };

    function initPrescriptionForm() {
        const form = document.getElementById('rx-form');
        if (!form) return;
        const sel = document.getElementById('rx-select-patient');
        if (sel) {
            sel.innerHTML = `<option value="">Select patient...</option>` +
                getPatients().map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
        }
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            const pid = (document.getElementById('rx-patient-id')?.value || document.getElementById('rx-select-patient')?.value || '').trim();
            const name = document.getElementById('rx-med-name').value.trim();
            const dos = document.getElementById('rx-dosage').value.trim();
            const freq = document.getElementById('rx-frequency').value;
            if (!pid || !name || !dos || !freq) { AH.showToast('Fill in all prescription fields.', 'error'); return; }
            const med = { id: AH.uuid(), patientId: pid, doctorId: session.userId, name, dosage: dos, frequency: freq, startDate: new Date().toISOString().split('T')[0], color: '#3B91E2' };
            const meds = AH.getItem(AH.KEYS.MEDICATIONS);
            meds.push(med);
            AH.setItem(AH.KEYS.MEDICATIONS, meds);
            generateDoses(med, pid);
            closeModal('rx-modal');
            AH.showToast(`Prescribed ${name}! 💊`, 'success');
            loadAll();
        });
    }

    function generateDoses(med, pid) {
        const doses = AH.getItem(AH.KEYS.DOSES);
        const count = med.frequency.toLowerCase().includes('twice') ? 2 : med.frequency.toLowerCase().includes('three') ? 3 : 1;
        const times = count === 1 ? [8] : count === 2 ? [8, 20] : [8, 14, 20];
        for (let d = 0; d < 30; d++) {
            times.forEach(hr => {
                const dt = new Date(); dt.setDate(dt.getDate() + d); dt.setHours(hr, 0, 0, 0);
                doses.push({ id: AH.uuid(), medId: med.id, patientId: pid, scheduledTime: dt.toISOString(), takenAt: null });
            });
        }
        AH.setItem(AH.KEYS.DOSES, doses);
    }

    // ── Appointment Form ──────────────────────────────────
    function initAddAppointmentForm() {
        const form = document.getElementById('appt-form');
        if (!form) return;
        const sel = document.getElementById('appt-patient');
        if (sel) sel.innerHTML = `<option value="">Select patient...</option>` + getPatients().map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            const pid = document.getElementById('appt-patient').value;
            const dt = document.getElementById('appt-datetime').value;
            const rsn = document.getElementById('appt-reason').value.trim();
            if (!pid || !dt || !rsn) { AH.showToast('Fill in all appointment fields.', 'error'); return; }
            const appts = AH.getItem(AH.KEYS.APPOINTMENTS);
            appts.push({ id: AH.uuid(), patientId: pid, doctorId: session.userId, datetime: new Date(dt).toISOString(), reason: rsn, attended: false });
            AH.setItem(AH.KEYS.APPOINTMENTS, appts);
            AH.showToast('Appointment scheduled! 📅', 'success');
            form.reset();
            renderStats();
        });
    }

    // ── Adherence Board ───────────────────────────────────
    function renderAllPatientAdherence() {
        const pts = getPatients();
        const con = document.getElementById('adherence-board');
        if (!con) return;
        if (!pts.length) { con.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><p>No patients to monitor.</p></div>`; return; }
        const sorted = pts.map(p => ({ ...p, pct: calcAdherence(p.id) })).sort((a, b) => a.pct - b.pct);
        con.innerHTML = sorted.map((p, i) => {
            const cls = adherenceClass(p.pct);
            return `<div class="patient-row">
        <div class="patient-avatar" style="background:${COLORS[i % COLORS.length]}">${p.name.charAt(0)}</div>
        <div class="patient-info">
          <div class="patient-name">${esc(p.name)} ${p.pct < 60 ? '<span class="badge badge-poor" style="font-size:0.7rem;margin-left:6px">⚠ Needs Attention</span>' : ''}</div>
          <div class="progress-wrap mt-8" style="max-width:260px"><div class="progress-bar progress-${cls}" style="width:${p.pct}%"></div></div>
        </div>
        <div class="patient-adherence"><div class="adherence-pct text-${cls}">${p.pct}%</div><span class="badge badge-${cls}">${cls.charAt(0).toUpperCase() + cls.slice(1)}</span></div>
        <button class="btn btn-outline btn-sm" onclick="showPatientDetail('${p.id}')">Details</button>
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
