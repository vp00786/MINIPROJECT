# AfterHeal – Patient Adherence System

## Project Description

AfterHeal is a frontend-only Patient Adherence Web Application built with HTML, CSS, and Vanilla JavaScript. It supports three user roles: Patient, Doctor, and Caregiver, each with their own dedicated dashboard.

## Demo Credentials (No Signup Required)

| Role      | Email                  | Password     |
|-----------|------------------------|--------------|
| Patient   | patient@demo.com       | patient123   |
| Doctor    | doctor@demo.com        | doctor123    |
| Caregiver | caregiver@demo.com     | caregiver123 |

## Features

### Patient Module
- View all prescribed medications with dosage and frequency
- Mark individual doses as "Taken" with real-time adherence update
- Automatic adherence percentage calculation (Good ≥80% / Moderate 60-79% / Poor <60%)
- Visual progress bars for each medication and overall
- Appointment tracking: upcoming, missed, attended

### Doctor Module
- View all registered patients with adherence levels
- Prescribe new medications with dosage, frequency, and notes
- Schedule appointments for patients
- Patient detail modal with full medication and appointment history
- Adherence monitoring board (worst performers highlighted)

### Caregiver Module
- Patient overview with today's dose status and next due time
- Real-time missed dose alerts with "Mark Taken" action
- Support log: add notes for each patient interaction
- Quick note input on the overview page

## Technical Stack

- **HTML** – Semantic, accessible, SEO-friendly pages
- **CSS** – Custom CSS variables, responsive layout, glassmorphism cards
- **JavaScript** – Vanilla ES6+, modular files, localStorage-only
- **No backend, no build tools, no frameworks needed**

## Folder Structure

```
/assets/          – Static assets
/styles/
  global.css      – Variables, reset, shared components
  auth.css        – Login/signup pages
  dashboard.css   – Sidebar, topbar, dashboard layout
/scripts/
  auth.js         – Auth, session, route guard, demo seed data
  patient.js      – Patient dashboard logic
  doctor.js       – Doctor dashboard logic
  caregiver.js    – Caregiver dashboard logic
index.html              – Landing page
signup.html             – Registration
login.html              – Login (with quick demo buttons)
patient-dashboard.html  – Patient portal
doctor-dashboard.html   – Doctor portal
caregiver-dashboard.html– Caregiver portal
```

## Running the Project

Simply open `index.html` in any modern browser. No server required.

## Academic / Demo Notes

- Data is seeded automatically on first load (demo accounts + 7-day medication history)
- Role-based route guard prevents cross-dashboard access
- All data stored in `localStorage` — cleared by clearing browser data
