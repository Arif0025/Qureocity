# QureoCity — Getting Started Guide

This guide walks through everything the app offers: what admins see and can do, how employees punch in/out, how check-in works at the front desk, and how the two different search tools are used.

---

## 1. Logging In

- **Admins and employees** both sign in from the same **Employee Login** page (linked from the homepage).
- Enter your email and password and select **Sign in**.
- You'll land on the **Admin Dashboard** if your account is an admin, or the **Employee Panel** if it's a staff account.
- Clicking the QureoCity logo in the top-left corner, from anywhere in the app, takes you back to the homepage.

---

## 2. The Admin Dashboard

The admin dashboard is organized into tabs across the top: **Overview, Kids Checked In, Quick Check-In, Search, Staff, Subscriptions, Shifts, Attendance, Settings.**

### 2.1 Overview tab

This is the home screen for admins, showing a live snapshot of the venue:

- **Kids checked in now** — how many children are currently on-site, out of total venue capacity. Click this card to jump straight to the **Kids Checked In** tab.
- **Check-ins today** — total number of check-ins recorded today. Click to jump to **Kids Checked In**.
- **Avg. visit length today** — the average duration of completed visits today (shows "—" if no visit has finished yet).
- **Staff on duty** — how many employees are currently punched in. Click to jump to the **Attendance** tab.

Below the stat cards:

- **Today's duty status** — a live list of every employee with an assigned shift, showing whether they are:
  - **Present** — punched in, still on duty
  - **Left** — punched in and out already today
  - **Absent** — their shift has started but they haven't punched in
  - **Upcoming** — their shift hasn't started yet
- **Check-in activity** — a calendar heatmap (like a contribution graph) of daily check-in counts over the last several weeks. Each square represents one day; darker squares mean more check-ins. Days the venue is closed are shown with a diagonal hatch pattern instead of a color. Click any square to see the exact count (or closed status) for that date.

### 2.2 Kids Checked In tab

Shows every child currently on-site in real time — no manual refresh needed. Use this to see who's on the floor at any moment and check individual children out.

### 2.3 Quick Check-In tab

A fast way to check in a child **who is already a subscribed member**, without needing their phone number:

1. Start typing the child's name.
2. Matching results appear showing the child's name, age, parent's name, and last 4 digits of their phone number (as an identity check).
3. If the child isn't checked in yet, choose a duration — **1h**, **2h**, or **∞** (no set end time) — to check them in immediately.
4. If they're already checked in, a **Check Out** button appears instead.

Only children with an **active subscription** appear in these results — this tool is exclusively for subscribed members.

### 2.4 Search tab

A general-purpose lookup tool for finding **any** registered family — subscribed or not:

1. Type a parent's name, a child's name, or a phone number.
2. Results show the parent's name, phone number, subscription status/expiry, and each of their children (name + age).
3. Click a result to expand it and see **visit history** — a full log of past check-ins with dates, durations, and status.
4. Admins can also edit a family's **membership** directly from a result: toggle **Active subscriber** on/off and set an expiry date, then **Save**.

**Quick Check-In vs. Search — the difference:**

| | Quick Check-In | Search |
|---|---|---|
| Who shows up | Only active subscribers | Every registered family |
| Purpose | Fast check-in/check-out | Look up details, visit history, edit membership |
| Search by | Child's name only | Parent name, child name, or phone number |
| Can check in/out? | Yes, directly | No — this is a lookup/records tool only |

### 2.5 Staff tab

Lists every employee and their role (staff or admin).

**To add an employee (admin only):**
1. Select **+ Add employee**.
2. Fill in their details in the modal that opens.
3. Submit — their account is created and ready to log in.

**To reset an employee's password (admin only):**
1. Select **Reset password** next to their name.
2. Confirm the reset.
3. A new temporary password is displayed on screen — share it with the employee so they can log in and set their own password from their **My Shift** tab.

### 2.6 Subscriptions tab (admin only)

Manage monthly memberships for registered families.

**To activate or renew a subscription:**
1. Search for the family by name or phone number.
2. Select them from the results.
3. Set the **purchase date** and **duration** (in months) — the expiry date previews automatically.
4. Select **Save**. The family's subscription is now active until the calculated expiry date.

**The subscriber list** below shows every family that has ever had a subscription, with filters for **All / Active / Expired** and sortable by expiry date.

### 2.7 Shifts tab (admin only)

Assign a standing daily shift to each employee.

1. Select an employee from the dropdown — if they already have a shift, it loads into the form for editing.
2. Set **Start** and **End** time.
3. Add optional **Notes**.
4. Select **Save** — this shift now applies every day until changed again.
5. Select **Remove** on an existing shift to delete it entirely.

Each employee can see their own assigned shift from their **My Shift** tab in the Employee Panel.

### 2.8 Attendance tab (admin only)

- **Today's duty status** — same live present/left/absent/upcoming summary shown on the Overview tab.
- **Attendance history** — a full table of every punch in/out ever recorded, with date, time, and duration. Select any employee's name to expand their complete individual history (up to their most recent 200 punches).

### 2.9 Settings tab (admin only)

- **Front-desk QR** — choose how employees punch in/out:
  - **Static** — one fixed QR code, no screen required at the desk.
  - **Dynamic** — a QR code shown on the `/desk` screen that automatically rotates every 45 seconds for tighter security.
- **Admin password** — change your own admin account password.

---

## 3. The Employee Panel

Employees see a simpler, mobile-friendly panel with five tabs: **Punch, Quick Check-In, On Site, Search, My Shift.**

The top of the panel always shows a quick glance at **kids currently on site** and **your shift hours**.

### 3.1 Punch tab

This is how employees clock in and out for their own shift:

1. Select the camera button to open the scanner.
2. Point your camera at the front-desk QR code (either the printed static code, or the rotating code on the `/desk` screen, depending on which mode the admin has set).
3. Once scanned, **slide to confirm**.
4. A confirmation screen shows whether you were punched **in** or **out**, and the exact time.

The system automatically knows whether to punch you in or out based on whether you already have an open shift for the day.

### 3.2 Quick Check-In tab

Identical to the admin version — search an active subscriber's child by name and check them in (1h / 2h / no limit) or check them out.

### 3.3 On Site tab

Shows every child currently checked in, live — same view as the admin's "Kids Checked In" tab.

### 3.4 Search tab

Same general family lookup as the admin Search tab (name/phone lookup + visit history), minus the membership-editing controls, which are admin-only.

### 3.5 My Shift tab

- Shows your assigned daily shift hours and any notes left by an admin. If no shift has been assigned yet, you'll see a message to check with an admin.
- **Change password** is always available here regardless of whether a shift is assigned — select it, enter and confirm a new password (minimum 8 characters), and save.

---

## 4. The Public Check-In Kiosk (`/checkin`)

This is the screen parents use themselves at the front desk to check their children in — no staff login required.

1. **Enter phone number** — the parent types their registered phone number.
2. **Returning family:** their name and children appear immediately. Staff visually confirm identity, then select which children to check in and for how long (1h / 2h / no limit), and confirm.
3. **New family:** if the phone number isn't recognized, a short registration form appears to add the parent and their children on the spot. Once submitted, it moves straight into selecting children to check in, just like a returning family.
4. **Confirmation screen** shows the successful check-in(s) with their end time (if any), then offers a **Done** button to return to the start for the next family.

---

## 5. The Desk Display (`/desk`)

A dedicated screen (typically a tablet or monitor mounted at the front desk) that shows the **dynamic QR code** for employee punch-ins, when Dynamic mode is enabled in Settings. The code refreshes automatically every 45 seconds.
