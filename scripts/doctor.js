/**
 * AfterHeal – doctor.js  (Enhanced v2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Doctor Dashboard: Patient management, click-to-select patient, prescription
 * management (patient-scoped), per-patient adherence monitoring, document viewer.
 *
 * Architecture:
 *   • _selectedPatientId – module-level state for the currently selected patient
 *   • loadAll()          – renders all sections from localStorage
 *   • selectPatient(id)  – highlights patient row, updates Rx + Adherence + Docs
 *   • renderXxx()        – pure render functions, safe to call anytime
 * ─────────────────────────────────────────────────────────────────────────────
 */

document.addEventListener('DOMContentLoaded', () => {

    // ── 1. Auth Guard (MANDATORY – blocks non-doctors) ────────────────────
    const session = AH.requireAuth('doctor');
    if (!session) return; // redirected by requireAuth

    // ── 2. Sidebar / Topbar setup ─────────────────────────────────────────
    AH.populateSidebarUser(session);
    AH.setTopbarDate();
    AH.initSidebarToggle();
    AH.initLogout();
    AH.initNavLinks();

    // ── 3. Module-level selected patient state ────────────────────────────
    /** @type {string|null} Currently selected patient ID */
    let _selectedPatientId = null;

    // ── 4. Defer loadAll so seedDemoData() in auth.js has completed ───────
    setTimeout(() => {
        loadAll();
        initPrescriptionForm();
        initAddAppointmentForm();
        initDocumentUploadForm();
    }, 0);

    // ── 5. Re-render on nav tab click ──────────────────────────────────────
    document.querySelectorAll('.nav-link[data-section]').forEach(link => {
        link.addEventListener('click', () => setTimeout(loadAll, 80));
    });

    // ─────────────────────────────────────────────────────────────────────
    // LOAD ALL
    // ─────────────────────────────────────────────────────────────────────
    function loadAll() {
        renderStats();
        renderPatientList();
        renderAllPatientAdherence();         // overview adherence board
        renderPatientScopedPrescriptions();  // Rx section: respects selected patient
        renderPatientScopedAdherence();      // Adherence section: per-patient
        renderDocuments();                   // Documents tab (inside My Patients)
        syncOverviewPreview();               // copy first 3 rows to overview card
    }

    // ─────────────────────────────────────────────────────────────────────
    // UTILITY HELPERS
    // ─────────────────────────────────────────────────────────────────────

    /** All users with role=patient */
    function getPatients() {
        return AH.getItem(AH.KEYS.USERS).filter(u => u.role === 'patient');
    }

    /** Medications prescribed to a patient */
    function getMedsForPatient(pid) {
        return AH.getItem(AH.KEYS.MEDICATIONS).filter(m => m.patientId === pid);
    }

    /** Documents for a patient */
    function getDocsForPatient(pid) {
        return AH.getItem(AH.KEYS.DOCUMENTS).filter(d => d.patientId === pid);
    }

    /** Adherence % for a patient (0-100) */
    function calcAdherence(pid) {
        const doses = AH.getItem(AH.KEYS.DOSES).filter(d => d.patientId === pid);
        const past = doses.filter(d => new Date(d.scheduledTime) <= new Date());
        if (!past.length) return 100;
        return Math.round(past.filter(d => d.takenAt).length / past.length * 100);
    }

    /** CSS class for adherence level */
    function adherenceClass(pct) {
        return pct >= 80 ? 'good' : pct >= 60 ? 'moderate' : 'poor';
    }

    /** HTML-escape a string */
    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /** Format ISO datetime → "Feb 28, 2:30 PM" */
    function fmtDT(iso) {
        return new Date(iso).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }

    /** Format ISO date → "Feb 28, 2026" */
    function fmtDate(iso) {
        return new Date(iso).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        });
    }

    const AVATAR_COLORS = ['#3B91E2', '#00C9A0', '#6C5CE7', '#F0A500', '#E74C3C', '#00B894'];

    // ─────────────────────────────────────────────────────────────────────
    // STATS (Overview)
    // ─────────────────────────────────────────────────────────────────────
    function renderStats() {
        const pts = getPatients();
        const meds = AH.getItem(AH.KEYS.MEDICATIONS);
        const adhs = pts.map(p => calcAdherence(p.id));
        const poor = adhs.filter(a => a < 60).length;
        const avg = adhs.length
            ? Math.round(adhs.reduce((s, v) => s + v, 0) / adhs.length)
            : 0;

        const el = id => document.getElementById(id);
        if (el('stat-patients')) el('stat-patients').textContent = pts.length;
        if (el('stat-meds-total')) el('stat-meds-total').textContent = meds.filter(m => m.doctorId === session.userId).length;
        if (el('stat-poor')) el('stat-poor').textContent = poor;
        if (el('stat-avg-adh')) el('stat-avg-adh').textContent = avg + '%';
    }

    // ─────────────────────────────────────────────────────────────────────
    // PATIENT LIST (My Patients – Patient List tab)
    // ─────────────────────────────────────────────────────────────────────
    function renderPatientList() {
        const pts = getPatients();
        const con = document.getElementById('patient-list');
        if (!con) return;

        if (!pts.length) {
            con.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">👤</div>
                <p>No patients registered yet.<br>Patients will appear here once they sign up.</p>
            </div>`;
            return;
        }

        con.innerHTML = pts.map((p, i) => {
            const pct = calcAdherence(p.id);
            const cls = adherenceClass(pct);
            const medCount = getMedsForPatient(p.id).length;
            const docCount = getDocsForPatient(p.id).length;
            const isSelected = p.id === _selectedPatientId;

            return `
            <div class="patient-row selectable-patient ${isSelected ? 'patient-selected' : ''}"
                 id="patient-row-${p.id}"
                 onclick="selectPatient('${p.id}')"
                 title="Click to select this patient"
                 style="cursor:pointer">
                <!-- Avatar -->
                <div class="patient-avatar" style="background:${AVATAR_COLORS[i % AVATAR_COLORS.length]}">
                    ${p.name.charAt(0).toUpperCase()}
                </div>
                <!-- Info -->
                <div class="patient-info">
                    <div class="patient-name">
                        ${esc(p.name)}
                        ${isSelected ? '<span class="badge badge-primary" style="margin-left:8px;font-size:0.68rem">Selected</span>' : ''}
                    </div>
                    <div class="patient-email">${esc(p.email)}</div>
                    <div class="patient-email" style="margin-top:4px">
                        <span title="Medications">💊 ${medCount} med${medCount !== 1 ? 's' : ''}</span>
                        &nbsp;·&nbsp;
                        <span title="Documents">📄 ${docCount} doc${docCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div class="progress-wrap mt-8" style="max-width:200px">
                        <div class="progress-bar progress-${cls}" style="width:${pct}%"></div>
                    </div>
                </div>
                <!-- Adherence badge -->
                <div class="patient-adherence">
                    <div class="adherence-pct text-${cls}">${pct}%</div>
                    <span class="badge badge-${cls}">${cls.charAt(0).toUpperCase() + cls.slice(1)}</span>
                </div>
                <!-- Actions -->
                <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
                    <button class="btn btn-primary btn-sm"
                        onclick="event.stopPropagation(); selectAndGo('${p.id}', 'section-prescriptions')">
                        💊 Prescribe
                    </button>
                    <button class="btn btn-outline btn-sm"
                        onclick="event.stopPropagation(); selectAndGo('${p.id}', 'section-adherence')">
                        📊 Adherence
                    </button>
                </div>
            </div>`;
        }).join('');
    }

    // ─────────────────────────────────────────────────────────────────────
    // PATIENT SELECTION
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Select a patient.
     * Updates _selectedPatientId, re-renders all patient-scoped sections.
     */
    window.selectPatient = function (pid) {
        _selectedPatientId = pid;
        renderPatientList();           // refresh row highlights
        renderPatientScopedPrescriptions();
        renderPatientScopedAdherence();
        renderDocuments();
        syncOverviewPreview();

        // Show feedback toast
        const p = AH.getItem(AH.KEYS.USERS).find(u => u.id === pid);
        if (p) AH.showToast(`Patient selected: ${p.name}`, 'info', 2000);
    };

    /**
     * Select patient AND navigate to a dashboard section.
     */
    window.selectAndGo = function (pid, sectionId) {
        _selectedPatientId = pid;
        // Trigger the nav button click for that section
        const navBtn = document.querySelector(`.nav-link[data-section="${sectionId}"]`);
        if (navBtn) navBtn.click();
        else {
            loadAll();
        }
    };

    // ─────────────────────────────────────────────────────────────────────
    // PRESCRIPTIONS – PATIENT-SCOPED
    // ─────────────────────────────────────────────────────────────────────
    function renderPatientScopedPrescriptions() {
        const banner = document.getElementById('rx-no-patient-banner');
        const content = document.getElementById('rx-patient-content');
        const nameDisplay = document.getElementById('rx-selected-patient-name');
        const medListEl = document.getElementById('rx-current-meds');

        if (!banner || !content) return;

        if (!_selectedPatientId) {
            // No patient selected — show prompt
            banner.style.display = 'flex';
            content.style.display = 'none';
            return;
        }

        const p = AH.getItem(AH.KEYS.USERS).find(u => u.id === _selectedPatientId);
        const meds = getMedsForPatient(_selectedPatientId);

        if (!p) return;

        banner.style.display = 'none';
        content.style.display = 'block';

        if (nameDisplay) {
            nameDisplay.textContent = p.name;
        }

        // Update the patient select hidden field
        const hiddenPid = document.getElementById('rx-patient-id');
        if (hiddenPid) hiddenPid.value = _selectedPatientId;

        // Render current medications for this patient
        if (!medListEl) return;

        if (!meds.length) {
            medListEl.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem">No medications prescribed yet.</p>`;
            return;
        }

        const doses = AH.getItem(AH.KEYS.DOSES).filter(d => d.patientId === _selectedPatientId);
        medListEl.innerHTML = meds.map(med => {
            const past = doses.filter(d => d.medId === med.id && new Date(d.scheduledTime) <= new Date());
            const adh = past.length
                ? Math.round(past.filter(d => d.takenAt).length / past.length * 100)
                : 100;
            const cls = adherenceClass(adh);

            return `
            <div class="med-card" style="padding:12px 16px;margin-bottom:8px" id="med-card-${med.id}">
                <div class="med-icon" style="width:38px;height:38px;font-size:1rem;background:${med.color}22;color:${med.color}">💊</div>
                <div class="med-info">
                    <div class="med-name" style="font-size:0.9rem">${esc(med.name)}</div>
                    <div class="med-detail">${esc(med.dosage)} · ${esc(med.frequency)}</div>
                    ${med.note ? `<div class="med-detail" style="font-style:italic;color:var(--text-muted)">${esc(med.note)}</div>` : ''}
                    <div style="margin-top:6px">
                        <span class="badge badge-${cls}" style="font-size:0.72rem">${adh}% adherence</span>
                        <span style="font-size:0.72rem;color:var(--text-muted);margin-left:8px">
                            Since ${fmtDate(med.startDate)}
                        </span>
                    </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
                    <button class="btn btn-ghost btn-sm"
                        onclick="openEditMed('${med.id}','${esc(med.name)}','${esc(med.dosage)}','${esc(med.frequency)}')">
                        ✏️ Edit
                    </button>
                    <button class="btn btn-danger btn-sm"
                        onclick="deleteMed('${med.id}','${_selectedPatientId}')">
                        🗑 Remove
                    </button>
                </div>
            </div>`;
        }).join('');
    }

    // ─────────────────────────────────────────────────────────────────────
    // PRESCRIPTION FORM
    // ─────────────────────────────────────────────────────────────────────
    function initPrescriptionForm() {
        const form = document.getElementById('rx-form');
        if (!form) return;

        form.addEventListener('submit', function (e) {
            e.preventDefault();

            const pid = document.getElementById('rx-patient-id')?.value || _selectedPatientId;
            const name = document.getElementById('rx-med-name').value.trim();
            const dos = document.getElementById('rx-dosage').value.trim();
            const freq = document.getElementById('rx-frequency').value;
            const note = document.getElementById('rx-note')?.value.trim() || '';

            if (!pid) { AH.showToast('Please select a patient first.', 'error'); return; }
            if (!name) { AH.showToast('Enter a medication name.', 'error'); return; }
            if (!dos) { AH.showToast('Enter a dosage.', 'error'); return; }
            if (!freq) { AH.showToast('Select a frequency.', 'error'); return; }

            const med = {
                id: AH.uuid(),
                patientId: pid,
                doctorId: session.userId,
                name, dosage: dos, frequency: freq, note,
                startDate: new Date().toISOString().split('T')[0],
                color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
            };

            const meds = AH.getItem(AH.KEYS.MEDICATIONS);
            meds.push(med);
            AH.setItem(AH.KEYS.MEDICATIONS, meds);
            generateDoses(med, pid);

            form.reset();
            document.getElementById('rx-patient-id').value = pid; // restore after reset

            AH.showToast(`${name} prescribed successfully! 💊`, 'success');
            loadAll();
        });
    }

    /** Generate dose schedule for a new medication (30 days forward + 7 days history) */
    function generateDoses(med, pid) {
        const doses = AH.getItem(AH.KEYS.DOSES);
        const count = med.frequency.toLowerCase().includes('twice') ? 2
            : med.frequency.toLowerCase().includes('three') ? 3 : 1;
        const times = count === 1 ? [8] : count === 2 ? [8, 20] : [8, 13, 20];

        // 7 historical days (for adherence visibility)
        for (let d = 7; d >= 1; d--) {
            times.forEach(hr => {
                const dt = new Date();
                dt.setDate(dt.getDate() - d);
                dt.setHours(hr, 0, 0, 0);
                doses.push({
                    id: AH.uuid(), medId: med.id, patientId: pid,
                    scheduledTime: dt.toISOString(),
                    takenAt: Math.random() > 0.3 ? new Date(dt.getTime() + 1800000).toISOString() : null,
                });
            });
        }
        // 30 future days
        for (let d = 0; d < 30; d++) {
            times.forEach(hr => {
                const dt = new Date();
                dt.setDate(dt.getDate() + d);
                dt.setHours(hr, 0, 0, 0);
                doses.push({ id: AH.uuid(), medId: med.id, patientId: pid, scheduledTime: dt.toISOString(), takenAt: null });
            });
        }
        AH.setItem(AH.KEYS.DOSES, doses);
    }

    // ── Edit Medication ──────────────────────────────────────────────────
    window.openEditMed = function (medId, name, dosage, frequency) {
        document.getElementById('edit-med-id').value = medId;
        document.getElementById('edit-med-name').value = name;
        document.getElementById('edit-med-dosage').value = dosage;
        document.getElementById('edit-med-frequency').value = frequency;
        openModal('edit-med-modal');
    };

    document.getElementById('edit-med-form')?.addEventListener('submit', function (e) {
        e.preventDefault();
        const medId = document.getElementById('edit-med-id').value;
        const meds = AH.getItem(AH.KEYS.MEDICATIONS);
        const idx = meds.findIndex(m => m.id === medId);
        if (idx === -1) return;

        meds[idx].name = document.getElementById('edit-med-name').value.trim() || meds[idx].name;
        meds[idx].dosage = document.getElementById('edit-med-dosage').value.trim() || meds[idx].dosage;
        meds[idx].frequency = document.getElementById('edit-med-frequency').value || meds[idx].frequency;

        AH.setItem(AH.KEYS.MEDICATIONS, meds);
        closeModal('edit-med-modal');
        AH.showToast('Medication updated! ✅', 'success');
        loadAll();
    });

    // ── Delete Medication ────────────────────────────────────────────────
    window.deleteMed = function (medId, pid) {
        if (!confirm('Remove this medication from the patient? This cannot be undone.')) return;
        AH.setItem(AH.KEYS.MEDICATIONS, AH.getItem(AH.KEYS.MEDICATIONS).filter(m => m.id !== medId));
        AH.showToast('Medication removed.', 'warning');
        loadAll();
    };

    // ─────────────────────────────────────────────────────────────────────
    // ADHERENCE – PER-PATIENT VIEW
    // ─────────────────────────────────────────────────────────────────────
    function renderPatientScopedAdherence() {
        const banner = document.getElementById('adh-no-patient-banner');
        const content = document.getElementById('adh-patient-content');
        if (!banner || !content) return;

        if (!_selectedPatientId) {
            banner.style.display = 'flex';
            content.style.display = 'none';
            return;
        }

        const p = AH.getItem(AH.KEYS.USERS).find(u => u.id === _selectedPatientId);
        if (!p) return;

        banner.style.display = 'none';
        content.style.display = 'block';

        // Header
        const nameEl = document.getElementById('adh-patient-name');
        if (nameEl) nameEl.textContent = p.name;

        // Overall %
        const pct = calcAdherence(_selectedPatientId);
        const cls = adherenceClass(pct);
        const pctEl = document.getElementById('adh-pct-value');
        const barEl = document.getElementById('adh-progress-bar');
        const lblEl = document.getElementById('adh-status-label');
        if (pctEl) { pctEl.textContent = pct + '%'; pctEl.className = `text-${cls}`; }
        if (barEl) { barEl.style.width = pct + '%'; barEl.className = `progress-bar progress-${cls}`; }
        if (lblEl) {
            const labels = { good: '🟢 Good', moderate: '🟡 Moderate', poor: '🔴 Poor' };
            lblEl.textContent = labels[cls];
            lblEl.className = `badge badge-${cls}`;
        }

        // Per-medication breakdown
        const meds = getMedsForPatient(_selectedPatientId);
        const doses = AH.getItem(AH.KEYS.DOSES).filter(d => d.patientId === _selectedPatientId);
        const now = new Date();

        const breakdownEl = document.getElementById('adh-med-breakdown');
        if (breakdownEl) {
            if (!meds.length) {
                breakdownEl.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem">No medications prescribed.</p>`;
            } else {
                breakdownEl.innerHTML = meds.map(med => {
                    const past = doses.filter(d => d.medId === med.id && new Date(d.scheduledTime) <= now);
                    const taken = past.filter(d => d.takenAt).length;
                    const missed = past.length - taken;
                    const ma = past.length ? Math.round(taken / past.length * 100) : 100;
                    const mc = adherenceClass(ma);

                    return `
                    <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:14px 16px;margin-bottom:10px;border:1px solid var(--border)">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
                            <div>
                                <div style="font-weight:700;font-size:0.95rem">${esc(med.name)}</div>
                                <div style="font-size:0.78rem;color:var(--text-muted)">${esc(med.dosage)} · ${esc(med.frequency)}</div>
                            </div>
                            <span class="badge badge-${mc}">${ma}%</span>
                        </div>
                        <div class="progress-wrap" style="margin-bottom:8px">
                            <div class="progress-bar progress-${mc}" style="width:${ma}%"></div>
                        </div>
                        <div style="display:flex;gap:16px;font-size:0.8rem">
                            <span class="text-good">✅ Taken: ${taken}</span>
                            <span class="text-poor">❌ Missed: ${missed}</span>
                            <span style="color:var(--text-muted)">📋 Total past doses: ${past.length}</span>
                        </div>
                    </div>`;
                }).join('');
            }
        }

        // Last 7-day trend
        render7DayTrend(meds, doses, now);
    }

    /** Renders a 7-day hit/miss heatmap-style grid for each medication */
    function render7DayTrend(meds, doses, now) {
        const trendEl = document.getElementById('adh-weekly-trend');
        if (!trendEl) return;

        if (!meds.length) {
            trendEl.innerHTML = '';
            return;
        }

        const days = [];
        for (let d = 6; d >= 0; d--) {
            const dt = new Date(now);
            dt.setDate(dt.getDate() - d);
            days.push(dt);
        }

        const dayLabels = days.map(d => d.toLocaleDateString('en-US', { weekday: 'short' }));

        trendEl.innerHTML = meds.map(med => {
            const cells = days.map(day => {
                const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
                const dayEnd = new Date(dayStart.getTime() + 86400000);
                const dayDoses = doses.filter(d => d.medId === med.id
                    && new Date(d.scheduledTime) >= dayStart
                    && new Date(d.scheduledTime) < dayEnd);

                if (!dayDoses.length) return `<div class="trend-cell trend-none" title="No dose scheduled"></div>`;
                const allTaken = dayDoses.every(d => d.takenAt);
                const someTaken = dayDoses.some(d => d.takenAt);
                const isDue = dayEnd > now; // future
                if (isDue) return `<div class="trend-cell trend-future" title="Upcoming"></div>`;
                if (allTaken) return `<div class="trend-cell trend-taken" title="All doses taken ✓"></div>`;
                if (someTaken) return `<div class="trend-cell trend-partial" title="Partial doses taken"></div>`;
                return `<div class="trend-cell trend-missed" title="Missed"></div>`;
            }).join('');

            return `
            <div style="margin-bottom:16px;">
                <div style="font-size:0.82rem;font-weight:600;margin-bottom:6px;color:var(--text-secondary)">${esc(med.name)}</div>
                <div style="display:flex;gap:4px;align-items:center">
                    ${cells}
                </div>
                <div style="display:flex;gap:4px;margin-top:4px">
                    ${dayLabels.map(l => `<div style="width:32px;font-size:0.66rem;text-align:center;color:var(--text-muted)">${l}</div>`).join('')}
                </div>
            </div>`;
        }).join('');
    }

    // ─────────────────────────────────────────────────────────────────────
    // DOCUMENTS – PATIENT-SCOPED
    // ─────────────────────────────────────────────────────────────────────

    /** Map of doc type → icon and label */
    const DOC_TYPE_META = {
        lab_report: { icon: '🧪', label: 'Lab Report', color: '#3B91E2' },
        discharge_summary: { icon: '🏥', label: 'Discharge Summary', color: '#6C5CE7' },
        x_ray: { icon: '🩻', label: 'X-Ray / Imaging', color: '#00C9A0' },
        prescription: { icon: '💊', label: 'Prescription', color: '#F0A500' },
        other: { icon: '📄', label: 'Document', color: '#8FA5BC' },
    };

    function renderDocuments() {
        const banner = document.getElementById('docs-no-patient-banner');
        const content = document.getElementById('docs-patient-content');
        if (!banner || !content) return;

        if (!_selectedPatientId) {
            banner.style.display = 'flex';
            content.style.display = 'none';
            return;
        }

        const p = AH.getItem(AH.KEYS.USERS).find(u => u.id === _selectedPatientId);
        if (!p) return;

        banner.style.display = 'none';
        content.style.display = 'block';

        const nameEl = document.getElementById('docs-patient-name');
        if (nameEl) nameEl.textContent = p.name;

        const docs = getDocsForPatient(_selectedPatientId)
            .sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));

        const gridEl = document.getElementById('docs-grid');
        if (!gridEl) return;

        if (!docs.length) {
            gridEl.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1">
                <div class="empty-icon">📂</div>
                <p>No documents uploaded yet for this patient.<br>Use the button above to add one.</p>
            </div>`;
            return;
        }

        gridEl.innerHTML = docs.map(doc => {
            const meta = DOC_TYPE_META[doc.type] || DOC_TYPE_META.other;
            return `
            <div class="doc-card" id="doc-${doc.id}">
                <div class="doc-icon" style="background:${meta.color}18;color:${meta.color}">${meta.icon}</div>
                <div class="doc-info">
                    <div class="doc-name">${esc(doc.name)}</div>
                    <div class="doc-meta">
                        <span class="badge badge-primary" style="font-size:0.68rem">${meta.label}</span>
                        <span style="font-size:0.75rem;color:var(--text-muted)">${fmtDate(doc.uploadDate)}</span>
                    </div>
                    ${doc.notes ? `<div class="doc-notes">${esc(doc.notes)}</div>` : ''}
                </div>
                <div class="doc-actions">
                    <a href="${doc.url}" target="_blank" class="btn btn-outline btn-sm"
                       onclick="${doc.url === '#' ? `event.preventDefault();AH.showToast('Document preview not available in demo mode.','info')` : ''}">
                       🔍 View
                    </a>
                    <button class="btn btn-danger btn-sm" onclick="deleteDoc('${doc.id}')">🗑</button>
                </div>
            </div>`;
        }).join('');
    }

    window.deleteDoc = function (docId) {
        if (!confirm('Remove this document?')) return;
        AH.setItem(AH.KEYS.DOCUMENTS, AH.getItem(AH.KEYS.DOCUMENTS).filter(d => d.id !== docId));
        AH.showToast('Document removed.', 'warning');
        renderDocuments();
        renderStats();
    };

    /** Upload document form */
    function initDocumentUploadForm() {
        const form = document.getElementById('doc-upload-form');
        if (!form) return;

        form.addEventListener('submit', function (e) {
            e.preventDefault();

            if (!_selectedPatientId) {
                AH.showToast('Select a patient first.', 'error'); return;
            }

            const name = document.getElementById('doc-name').value.trim();
            const type = document.getElementById('doc-type').value;
            const notes = document.getElementById('doc-notes').value.trim();
            const fileEl = document.getElementById('doc-file');
            const fileName = fileEl && fileEl.files[0] ? fileEl.files[0].name : '';

            if (!name || !type) {
                AH.showToast('Enter document name and type.', 'error'); return;
            }

            const doc = {
                id: AH.uuid(),
                patientId: _selectedPatientId,
                doctorId: session.userId,
                name: fileName ? `${name} (${fileName})` : name,
                type, notes,
                uploadDate: new Date().toISOString(),
                url: '#',   // In a real backend this would be a storage URL
            };

            const docs = AH.getItem(AH.KEYS.DOCUMENTS);
            docs.push(doc);
            AH.setItem(AH.KEYS.DOCUMENTS, docs);

            closeModal('doc-upload-modal');
            form.reset();
            AH.showToast(`Document "${name}" added! 📄`, 'success');
            renderDocuments();
            renderStats();
        });
    }

    window.openDocUploadModal = function () {
        if (!_selectedPatientId) {
            AH.showToast('Select a patient from the Patient List first.', 'warning'); return;
        }
        const p = AH.getItem(AH.KEYS.USERS).find(u => u.id === _selectedPatientId);
        const lbl = document.getElementById('doc-upload-patient-name');
        if (lbl && p) lbl.textContent = p.name;
        openModal('doc-upload-modal');
    };

    // ─────────────────────────────────────────────────────────────────────
    // OVERVIEW ADHERENCE BOARD (global – all patients, read-only)
    // ─────────────────────────────────────────────────────────────────────
    function renderAllPatientAdherence() {
        const pts = getPatients();
        const con = document.getElementById('adherence-board');
        if (!con) return;

        if (!pts.length) {
            con.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><p>No patients to monitor.</p></div>`;
            return;
        }

        const sorted = pts
            .map(p => ({ ...p, pct: calcAdherence(p.id) }))
            .sort((a, b) => a.pct - b.pct);

        con.innerHTML = sorted.map((p, i) => {
            const cls = adherenceClass(p.pct);
            return `
            <div class="patient-row" style="cursor:pointer" onclick="selectAndGo('${p.id}','section-adherence')">
                <div class="patient-avatar" style="background:${AVATAR_COLORS[i % AVATAR_COLORS.length]}">${p.name.charAt(0)}</div>
                <div class="patient-info">
                    <div class="patient-name">
                        ${esc(p.name)}
                        ${p.pct < 60 ? '<span class="badge badge-poor" style="font-size:0.7rem;margin-left:6px">⚠ Attention</span>' : ''}
                    </div>
                    <div class="progress-wrap mt-8" style="max-width:260px">
                        <div class="progress-bar progress-${cls}" style="width:${p.pct}%"></div>
                    </div>
                </div>
                <div class="patient-adherence">
                    <div class="adherence-pct text-${cls}">${p.pct}%</div>
                    <span class="badge badge-${cls}">${cls.charAt(0).toUpperCase() + cls.slice(1)}</span>
                </div>
                <button class="btn btn-outline btn-sm"
                    onclick="event.stopPropagation();selectAndGo('${p.id}','section-patients')">
                    View Profile
                </button>
            </div>`;
        }).join('');
    }

    // ─────────────────────────────────────────────────────────────────────
    // APPOINTMENT FORM
    // ─────────────────────────────────────────────────────────────────────
    function initAddAppointmentForm() {
        const form = document.getElementById('appt-form');
        if (!form) return;

        // Populate patient select
        const sel = document.getElementById('appt-patient');
        if (sel) {
            const pts = getPatients();
            sel.innerHTML = `<option value="">Select patient…</option>` +
                pts.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
            // Pre-select if a patient is already chosen
            if (_selectedPatientId) sel.value = _selectedPatientId;
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            const pid = document.getElementById('appt-patient').value;
            const dt = document.getElementById('appt-datetime').value;
            const rsn = document.getElementById('appt-reason').value.trim();

            if (!pid) { AH.showToast('Select a patient.', 'error'); return; }
            if (!dt) { AH.showToast('Pick a date and time.', 'error'); return; }
            if (!rsn) { AH.showToast('Enter a reason.', 'error'); return; }

            const appts = AH.getItem(AH.KEYS.APPOINTMENTS);
            appts.push({
                id: AH.uuid(), patientId: pid, doctorId: session.userId,
                datetime: new Date(dt).toISOString(), reason: rsn, attended: false,
            });
            AH.setItem(AH.KEYS.APPOINTMENTS, appts);
            AH.showToast('Appointment scheduled! 📅', 'success');
            form.reset();
            renderStats();
        });
    }

    // ─────────────────────────────────────────────────────────────────────
    // OVERVIEW PREVIEW (first 3 patient rows in the overview card)
    // ─────────────────────────────────────────────────────────────────────
    function syncOverviewPreview() {
        const preview = document.getElementById('patient-list-preview');
        const full = document.getElementById('patient-list');
        if (!preview || !full) return;

        const rows = full.querySelectorAll('.patient-row');
        const first3 = Array.from(rows).slice(0, 3);
        preview.innerHTML = first3.map(r => r.outerHTML).join('');
    }

    // ─────────────────────────────────────────────────────────────────────
    // MODAL HELPERS
    // ─────────────────────────────────────────────────────────────────────
    function openModal(id) { document.getElementById(id)?.classList.add('open'); }
    window.closeModal = function (id) { document.getElementById(id)?.classList.remove('open'); };

    // Close modal when clicking the backdrop
    document.querySelectorAll('.modal-overlay').forEach(el => {
        el.addEventListener('click', function (e) {
            if (e.target === this) this.classList.remove('open');
        });
    });
});
