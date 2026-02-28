/**
 * AfterHeal – auth.js
 * Handles: Registration, Login, Session Management, Route Guard, Demo Data Seeding
 */

// ── Storage Keys ──────────────────────────────────────────
const KEYS = {
    USERS: 'ah_users',
    SESSION: 'ah_session',
    MEDICATIONS: 'ah_medications',
    DOSES: 'ah_doses',
    APPOINTMENTS: 'ah_appointments',
    SUPPORT_LOG: 'ah_support_log',
    DOCUMENTS: 'ah_documents',          // Patient medical documents (view-only for doctors)
    EMERGENCY_CONTACTS: 'ah_emergency_contacts',  // Patient emergency contacts
    NOTIFICATIONS: 'ah_notifications',       // Missed-dose & system notifications
    SEEDED: 'ah_seeded',
};

// ── Helpers ───────────────────────────────────────────────
function getItem(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } }
function setItem(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function getSession() { try { return JSON.parse(localStorage.getItem(KEYS.SESSION)); } catch { return null; } }
function setSession(sess) { localStorage.setItem(KEYS.SESSION, JSON.stringify(sess)); }
function clearSession() { localStorage.removeItem(KEYS.SESSION); }
function uuid() { return 'id_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36); }

// ── Demo Seed Data ────────────────────────────────────────
function seedDemoData() {
    if (localStorage.getItem(KEYS.SEEDED)) return;

    const patientId = 'demo_patient';
    const doctorId = 'demo_doctor';
    const caregiverId = 'demo_caregiver';

    // Demo users
    const users = [
        { id: patientId, name: 'Alex Johnson', email: 'patient@demo.com', password: 'patient123', role: 'patient' },
        { id: doctorId, name: 'Dr. Sarah Patel', email: 'doctor@demo.com', password: 'doctor123', role: 'doctor' },
        { id: caregiverId, name: 'Emma Williams', email: 'caregiver@demo.com', password: 'caregiver123', role: 'caregiver' },
    ];
    setItem(KEYS.USERS, users);

    // Demo medications (prescribed by doctor to patient)
    const medications = [
        { id: 'med_1', patientId, doctorId, name: 'Metformin', dosage: '500mg', frequency: 'Twice daily', startDate: '2026-02-01', color: '#3B91E2' },
        { id: 'med_2', patientId, doctorId, name: 'Atorvastatin', dosage: '20mg', frequency: 'Once at night', startDate: '2026-02-01', color: '#00C9A0' },
        { id: 'med_3', patientId, doctorId, name: 'Amlodipine', dosage: '5mg', frequency: 'Once daily', startDate: '2026-02-01', color: '#6C5CE7' },
        { id: 'med_4', patientId, doctorId, name: 'Aspirin', dosage: '75mg', frequency: 'Once daily', startDate: '2026-02-01', color: '#F0A500' },
    ];
    setItem(KEYS.MEDICATIONS, medications);

    // Caregiver assignment — store caregiverId on patient record
    const updatedUsers = users.map(u => u.id === patientId ? { ...u, caregiverId } : u);
    setItem(KEYS.USERS, updatedUsers);

    // Demo doses (last 7 days schedule for patient)
    const doses = [];
    const today = new Date();
    medications.forEach(med => {
        const count = med.frequency.toLowerCase().includes('twice') ? 2 : 1;
        for (let d = 6; d >= 0; d--) {
            for (let t = 0; t < count; t++) {
                const scheduled = new Date(today);
                scheduled.setDate(today.getDate() - d);
                scheduled.setHours(t === 0 ? 8 : 20, 0, 0, 0);
                const doseId = uuid();
                const takenChance = d > 0 ? Math.random() > 0.25 : (scheduled < new Date() ? Math.random() > 0.4 : null);
                doses.push({
                    id: doseId,
                    medId: med.id,
                    patientId,
                    scheduledTime: scheduled.toISOString(),
                    takenAt: takenChance === true ? new Date(scheduled.getTime() + Math.random() * 3600000).toISOString() : null,
                });
            }
        }
    });
    setItem(KEYS.DOSES, doses);

    // Demo appointments
    const appts = [
        { id: uuid(), patientId, doctorId, datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5, 10, 30).toISOString(), reason: 'Routine Checkup', attended: false },
        { id: uuid(), patientId, doctorId, datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 12, 14, 0).toISOString(), reason: 'Blood Sugar Review', attended: false },
        { id: uuid(), patientId, doctorId, datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 10, 9, 0).toISOString(), reason: 'Cardiology Consultation', attended: false },
        { id: uuid(), patientId, doctorId, datetime: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 3, 11, 0).toISOString(), reason: 'Medication Review', attended: true },
    ];
    setItem(KEYS.APPOINTMENTS, appts);

    // Demo support log
    const supportLog = [
        { id: uuid(), caregiverId, patientId, note: 'Assisted Alex with morning medications – all taken on time.', timestamp: new Date(today.getTime() - 86400000).toISOString() },
        { id: uuid(), caregiverId, patientId, note: 'Reminded Alex about evening Atorvastatin dose.', timestamp: new Date(today.getTime() - 172800000).toISOString() },
    ];
    setItem(KEYS.SUPPORT_LOG, supportLog);

    // Demo patient documents
    const docs = [
        { id: uuid(), patientId, doctorId, name: 'Blood Sugar Report (Feb 2026)', type: 'lab_report', uploadDate: new Date(today.getTime() - 5 * 86400000).toISOString(), url: '#', notes: 'HbA1c: 7.2%, Fasting: 148 mg/dL' },
        { id: uuid(), patientId, doctorId, name: 'Cardiac Discharge Summary', type: 'discharge_summary', uploadDate: new Date(today.getTime() - 15 * 86400000).toISOString(), url: '#', notes: 'Discharged after routine cardiac review. BP stable.' },
        { id: uuid(), patientId, doctorId, name: 'Chest X-Ray (Jan 2026)', type: 'x_ray', uploadDate: new Date(today.getTime() - 30 * 86400000).toISOString(), url: '#', notes: 'No abnormalities detected.' },
        { id: uuid(), patientId, doctorId, name: 'Lipid Panel Results', type: 'lab_report', uploadDate: new Date(today.getTime() - 45 * 86400000).toISOString(), url: '#', notes: 'LDL: 112 mg/dL, HDL: 48 mg/dL, Total: 195 mg/dL' },
    ];
    setItem(KEYS.DOCUMENTS, docs);

    // Demo emergency contacts for patient
    const emergencyContacts = [
        { id: uuid(), patientId, name: 'Mary Johnson', relation: 'Mother', phone: '+1-555-0101', notifiedAt: null },
        { id: uuid(), patientId, name: 'Robert Johnson', relation: 'Father', phone: '+1-555-0102', notifiedAt: null },
    ];
    setItem(KEYS.EMERGENCY_CONTACTS, emergencyContacts);

    // Start with empty notification store (notifications.js will populate on missed doses)
    setItem(KEYS.NOTIFICATIONS, []);

    localStorage.setItem(KEYS.SEEDED, 'true');
    console.log('[AfterHeal] Demo data seeded ✓');
}

// ── Register ──────────────────────────────────────────────
function registerUser(name, email, password, role) {
    const users = getItem(KEYS.USERS);
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
        return { ok: false, error: 'An account with this email already exists.' };
    }
    const newUser = { id: uuid(), name: name.trim(), email: email.trim().toLowerCase(), password, role };
    users.push(newUser);
    setItem(KEYS.USERS, users);
    return { ok: true, user: newUser };
}

// ── Login ─────────────────────────────────────────────────
function loginUser(email, password) {
    const users = getItem(KEYS.USERS);
    const user = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password);
    if (!user) return { ok: false, error: 'Invalid email or password. Please try again.' };
    setSession({ userId: user.id, role: user.role, name: user.name });
    return { ok: true, user };
}

// ── Logout ────────────────────────────────────────────────
function logout() {
    clearSession();
    window.location.href = 'login.html';
}

// ── Route Guard ───────────────────────────────────────────
/** Call at top of each dashboard to verify auth and correct role */
function requireAuth(expectedRole) {
    const session = getSession();
    if (!session) {
        window.location.href = 'login.html';
        return null;
    }
    if (expectedRole && session.role !== expectedRole) {
        // Redirect to their own dashboard
        const map = { patient: 'patient-dashboard.html', doctor: 'doctor-dashboard.html', caregiver: 'caregiver-dashboard.html' };
        window.location.href = map[session.role] || 'login.html';
        return null;
    }
    return session;
}

// ── Toast helper (used across all pages) ──────────────────
function showToast(message, type = 'success', duration = 3500) {
    let toast = document.getElementById('ah-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'ah-toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type] || '✅'}</span><span>${message}</span>`;
    toast.className = `toast toast-${type} show`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ── DOM helpers ───────────────────────────────────────────
function $(sel, ctx = document) { return ctx.querySelector(sel); }
function $$(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }

function showAlert(el, message, type = 'error') {
    if (!el) return;
    el.textContent = message;
    el.className = `alert alert-${type} show`;
}
function hideAlert(el) { if (el) el.className = 'alert'; }

// ── Signup Page Logic ─────────────────────────────────────
function initSignup() {
    seedDemoData();
    const form = document.getElementById('signup-form');
    const alert = document.getElementById('signup-alert');
    if (!form) return;

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        hideAlert(alert);

        const name = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const confirm = document.getElementById('confirm-password').value;
        const roleEl = document.querySelector('input[name="role"]:checked');

        if (!name || !email || !password || !roleEl) {
            showAlert(alert, '⚠️ Please fill in all fields and select a role.'); return;
        }
        if (password.length < 6) {
            showAlert(alert, '⚠️ Password must be at least 6 characters.'); return;
        }
        if (password !== confirm) {
            showAlert(alert, '⚠️ Passwords do not match.'); return;
        }

        const result = registerUser(name, email, password, roleEl.value);
        if (!result.ok) { showAlert(alert, '⚠️ ' + result.error); return; }

        showAlert(alert, '✅ Account created! Redirecting to login...', 'success');
        setTimeout(() => window.location.href = 'login.html', 1500);
    });

    // Toggle password visibility
    document.getElementById('toggle-pw')?.addEventListener('click', () => togglePwVisibility('password', 'toggle-pw'));
    document.getElementById('toggle-cpw')?.addEventListener('click', () => togglePwVisibility('confirm-password', 'toggle-cpw'));
}

// ── Login Page Logic ──────────────────────────────────────
function initLogin() {
    seedDemoData();
    const form = document.getElementById('login-form');
    const alert = document.getElementById('login-alert');
    if (!form) return;

    // If already logged in, redirect
    const sess = getSession();
    if (sess) {
        const map = { patient: 'patient-dashboard.html', doctor: 'doctor-dashboard.html', caregiver: 'caregiver-dashboard.html' };
        window.location.href = map[sess.role] || 'index.html';
        return;
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        hideAlert(alert);

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        if (!email || !password) {
            showAlert(alert, '⚠️ Please enter your email and password.'); return;
        }

        const result = loginUser(email, password);
        if (!result.ok) { showAlert(alert, '⚠️ ' + result.error); return; }

        const dashboards = { patient: 'patient-dashboard.html', doctor: 'doctor-dashboard.html', caregiver: 'caregiver-dashboard.html' };
        showAlert(alert, `✅ Welcome back, ${result.user.name}! Redirecting...`, 'success');
        setTimeout(() => window.location.href = dashboards[result.user.role] || 'index.html', 1200);
    });

    document.getElementById('toggle-pw')?.addEventListener('click', () => togglePwVisibility('password', 'toggle-pw'));
}

// ── Password toggle helper ────────────────────────────────
function togglePwVisibility(inputId, btnId) {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    if (!input) return;
    if (input.type === 'password') { input.type = 'text'; if (btn) btn.textContent = '🙈'; }
    else { input.type = 'password'; if (btn) btn.textContent = '👁️'; }
}

// ── Dashboard Sidebar Populate ────────────────────────────
function populateSidebarUser(session) {
    const nameEl = document.getElementById('sidebar-user-name');
    const roleEl = document.getElementById('sidebar-user-role');
    const initEl = document.getElementById('sidebar-avatar');
    if (nameEl) nameEl.textContent = session.name;
    if (roleEl) roleEl.textContent = session.role.charAt(0).toUpperCase() + session.role.slice(1);
    if (initEl) initEl.textContent = session.name.charAt(0).toUpperCase();
    // Topbar greeting
    const greet = document.getElementById('topbar-greeting');
    if (greet) greet.textContent = `Welcome, ${session.name.split(' ')[0]} 👋`;
}

// ── Topbar date ───────────────────────────────────────────
function setTopbarDate() {
    const el = document.getElementById('topbar-date');
    if (!el) return;
    el.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

// ── Mobile sidebar toggle ─────────────────────────────────
function initSidebarToggle() {
    const hamburger = document.getElementById('hamburger-btn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!hamburger || !sidebar) return;

    const open = () => { sidebar.classList.add('open'); overlay?.classList.add('open'); };
    const close = () => { sidebar.classList.remove('open'); overlay?.classList.remove('open'); };

    hamburger.addEventListener('click', open);
    overlay?.addEventListener('click', close);
}

// ── Tab switching ─────────────────────────────────────────
function initTabs() {
    $$('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const targetId = this.dataset.tab;
            const container = this.closest('[data-tab-container]') || document;
            $$(`.tab-btn`, container.parentElement || document).forEach(b => b.classList.remove('active'));
            $$(`.tab-panel`, container.parentElement || document).forEach(p => p.classList.remove('active'));
            this.classList.add('active');
            const panel = document.getElementById(targetId);
            if (panel) panel.classList.add('active');
        });
    });
}

// ── Logout buttons ────────────────────────────────────────
function initLogout() {
    $$('.logout-btn').forEach(btn => btn.addEventListener('click', logout));
}

// ── Nav link active state ─────────────────────────────────
function initNavLinks() {
    $$('.nav-link[data-section]').forEach(link => {
        link.addEventListener('click', function () {
            $$('.nav-link').forEach(l => l.classList.remove('active'));
            this.classList.add('active');
            const target = this.dataset.section;
            $$('.dashboard-section').forEach(sec => {
                sec.style.display = sec.id === target ? 'block' : 'none';
            });
            // close mobile sidebar
            document.getElementById('sidebar')?.classList.remove('open');
            document.getElementById('sidebar-overlay')?.classList.remove('open');
        });
    });

    // Activate first section by default
    const firstLink = $('.nav-link[data-section]');
    if (firstLink) firstLink.click();
}

// ── Expose globals ────────────────────────────────────────
window.AH = {
    KEYS, getItem, setItem, getSession, uuid,
    requireAuth, logout, showToast, $, $$,
    populateSidebarUser, setTopbarDate,
    initSidebarToggle, initTabs, initLogout, initNavLinks,
    showAlert, hideAlert,
};

// ── Auto-init based on page ───────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const page = location.pathname.split('/').pop() || 'index.html';
    if (page === 'signup.html') initSignup();
    if (page === 'login.html') initLogin();
    else seedDemoData(); // ensure demo data exists on every page
});
