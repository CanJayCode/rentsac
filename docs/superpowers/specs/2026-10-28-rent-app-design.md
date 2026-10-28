# Rentsac: rent and light-bill tracker for a small building

Date: 2026-10-28
Repo: https://github.com/CanJayCode/rentsac (empty at time of writing)

## Intent

The owner's father manages a rented building with 16 rooms. Today he keeps everything in a Google Sheet on his phone: monthly rent paid and pending per tenant, and electricity meter readings that become each tenant's light bill. The sheet works but is error-prone (typos in readings, "3000 बाकी" typed by hand, pending totals added up manually, history spread across free-text notes).

Build a small phone-first web app that replaces the sheet. It must be simple enough that the father can use it without help, and look premium and calm rather than like a spreadsheet. The son (the person commissioning this) also uses it.

## Users

- The father: the main user, on his phone. Comfortable in English and Marathi. Not technical.
- The son: also logs in, mainly to check or help.
- Tenants never log in and never see the app.

Both users share one PIN. There are no usernames, no accounts and no roles.

## Goals

1. Record rent payments per tenant and always show what is still pending.
2. Record meter readings in rounds, turn them into light bills, and show what is pending per tenant.
3. Show at a glance, on one screen, who owes what.
4. Keep the main (common) meter readings on record for reference.
5. Work well on a phone first, installable to the home screen (PWA), in English and Marathi.
6. Give a one-tap way to send a tenant their bill on WhatsApp.

## Non-goals

- Tenant logins, tenant portal, online rent collection or payment gateways. Money moves by cash or PhonePe outside the app; the app only records it.
- Maintenance tickets, leases, documents, multiple properties, multi-landlord SaaS.
- Automatic reminders or SMS sending.
- Importing every historical free-text note from the Excel file.

## Anti-goals (a failure even if it technically works)

- Anything the father has to learn: if entering a reading or a payment needs explanation, it failed.
- A spreadsheet-looking UI.
- A reading typo silently becoming a wrong bill.
- Old bills changing when the rate or a tenant changes later.
- Tenant data readable without the PIN.

## Source data (the Excel file the builder should read)

The file is `Untitled spreadsheet.xlsx` and has three sheets. The owner will supply it; it is not in the repo. Findings:

- **Sheet1, light bill per tenant.** One block per room: date, current reading (चालू रीडिंग), previous reading (मागील रीडिंग), "units x 10", bill amount, and loose notes such as "200 जमा" (paid) and "1390 बिल बाकी" (pending). Rooms seen: 3, 4, 5, 6, 7, 10, 12, 13.
- **Sheet2, rent per tenant.** One block per room: period label, rent (3000 in every row seen), amount paid, and mode/date (cash, PhonePe, "phone pay +cash"). Unpaid months say "3000 बाकी". Rooms seen: 3, 4, 5, 13, 14. A single payment often covers several months (for example 6000 or 6400). Payment can include extra beyond rent (3200, 3500, 3990), which presumably includes light bill.
- **Sheet3, meter readings.** One row per room 1 to 16, one column per reading round, from mid-July 2025 onwards. Below the rooms: block meters labelled "1-4", "5-8", "9-12", "13-16", plus "inverter". A later table (rows 38 to 60) has the most recent rounds and also a "motar" (motor/pump) row. Some date headers were parsed by Sheets as the wrong month/day (for example a cell showing 10 Jan 2025 where a mid-October date was meant), so column order, not the header value, is the reliable chronology.
- Sheet3 has typing mistakes the app must catch in future: room 16 shows 106 where about 1062 is expected; the inverter drops from 3198 to 3135.
- Tenants named in the file: room 3 Vaibhav Kusekar, room 4 Kulkarni, room 5 Vijay, room 6 Ovhal (spelling as typed), room 7 Mauli Lavhale, room 10 Pravin Narawade, room 12 Akshay, room 13 Gaikwad, room 14 Praveen. Names for other rooms are unknown; they may be vacant or simply not tracked yet.
- Another table in Sheet3 (Aditi / Sonar / Atul / light bill) is unrelated to this app. Ignore it.

## Decisions made by the owner

- Database: Supabase. Hosting: Vercel. Repo: the one above. The owner has the Vercel CLI installed and will create the Supabase project from steps the builder provides at the end.
- Look: **Soft Light**. Warm ivory background (about #f7f3ea), deep green accent (about #1d6b3f), amber for "due", green for "paid", white cards with a soft shadow, rounded corners, large type. Chosen from three mockups (dark gold, soft light, clean black and white).
- Auth: lock-screen style PIN pad, no username. Shared by father and son. Simple, not "enterprise".
- Languages: English and Marathi, with a switch. Both users read both.
- Meter entry: **all rooms in one list**, like the sheet. Each row shows room, tenant, last reading and a box for the new reading. A second screen lists the main meters (four blocks, inverter, motor) in the same style. Main meters are reference only and never affect any tenant's bill.
- Main-meter readings are only noted down. No comparison or loss checks are wanted.
- Light rate: ₹10 per unit.

## Behaviour

### Home
Total pending across all tenants, filter tabs (All, Rent, Light), one row per occupied room: room number, tenant name, what is due, and a status chip (green Paid, amber with the amount if due). Tapping a row opens the room page. Prominent actions to start a reading round and record a payment.

### Room page
Tenant name, rent amount, rent cycle, a ledger of everything charged and paid (rent months, light bills, payments), current pending rent and pending light, a button to record a payment, and a button to share the current bill on WhatsApp (a pre-filled message with the amounts; no integration, just a share link).

### Rent
- Each tenant has a monthly rent amount (3000 for everyone seen, but it is per tenant) and a rent cycle. Three cycle styles exist in the sheet: calendar month (1st to end of month), 12th to 11th (room 5), 26th to 25th (room 4). The cycle is just a start day per tenant; a month's period runs from that day to the day before the same day next month.
- The app produces one rent charge per tenant per cycle period, automatically, so nobody types "3000 बाकी".

### Reading rounds
- A round has a date (default today) and a reading for each occupied room plus the main meters. The father reads on or about the 15th and sometimes the 30th, so the app does not assume once a month: every round bills the units used since that room's previous reading.
- Light bill for a room = (new reading - previous reading) x rate in effect for the round. A finished round stores the rate and the resulting amount with the bill and never changes if the rate changes later.
- Validation before saving: warn when a reading is lower than the previous one, and when it is far above the room's usual use. The user can fix it or confirm it is correct (for example after a meter replacement). Confirmed lower readings need a clear way to restart from a new base so the bill is not negative.
- A round can be saved with some rooms still empty (room not read yet) and finished later.
- Rooms with no tenant still have readings recorded, because Sheet3 tracks all 16 rooms.

### Payments
- A payment has tenant, amount, date, mode (cash, PhonePe, or both with a split), and optional note.
- One payment can cover rent, light, or both, and does not have to match a bill. The app allocates it against the oldest unpaid charges first and shows what remains, so partial payments and overpayments carry forward.
- Edit or delete of a mistaken entry must be possible and visible in the ledger.

### Rooms and tenants
Add, edit and vacate rooms and tenants. Rent amount and cycle are per tenant. A vacated tenant's history stays viewable.

### Sharing
- Per tenant: a pre-filled WhatsApp message for the month's bill (rent and light, with readings and units).
- Whole building: copy a plain-text summary of this month's pending.

### PIN and security
- Six-digit PIN set once, stored only as a hash on the server. Wrong guesses are rate-limited and then briefly locked out.
- After a correct PIN the phone is remembered for about 30 days (httpOnly cookie), then asks again.
- Supabase must not be reachable directly from the browser with a public key. Row-level security stays on with no public policies, and the app's server code reads and writes with a server-side-only key. The tenant data is private (names, money owed).

## Data import

On first setup, bring in from the Excel file: rooms 1 to 16, the tenants named above with their rent and rent cycle, the Sheet3 reading history (so the first new round has correct "last readings"), and the current pending rent and light per tenant. Figures seen in the file, to confirm at import rather than trust: room 4 rent pending 9000; room 14 rent pending 5510; room 5 rent 6000 pending and light 1390 pending; room 13 rent 6000 pending and light 2320 pending. Dates from Sheet3 headers are unreliable (see above), so imported rounds are dated best-effort and listed for the owner to review. Older free-text notes stay in the Excel file. Import is a one-time script, not a feature of the app.

## Calls made while writing this (not yet confirmed by the owner)

- **Rent timing.** A rent charge appears at the start of its cycle period (rent is treated as due in advance). The sheet already lists the current period as an unpaid row, which supports this.
- **Opening balances.** The import records each tenant's current pending rent and pending light as opening balances. Automatic rent charges begin from the next period start after import. Nothing is back-filled from a tenant start date.
- **Imported readings.** Sheet3 rounds only seed each room's "last reading" and the reading history. They do not create bills, because the pending light figures from the file already stand for what was billed. If the latest round turns out to be unbilled, the owner will see that in the import dry run.
- **Import dry run.** The import script first prints a report (rooms, tenants, rent, cycle, opening balances, imported rounds with their dates) and writes nothing until the owner approves it. Room 14's 5510 pending is not a multiple of 3000, so it probably mixes rent and light; the report must flag it for the owner to split.
- **Defaults where the file is silent.** Rent 3000 and a calendar-month cycle. Rooms 1, 2, 8, 9, 11, 15 and 16 have no known tenant and are imported as vacant rooms with readings only.
- **Payment allocation.** Confirmed by the owner: the father treats a mixed amount such as 3200 as rent plus a little toward the light bill, in one payment. The payment form therefore has an optional "for" choice: Auto, Rent, or Light, defaulting to Auto. Auto allocates oldest unpaid charge first across both types combined. Choosing Rent or Light allocates oldest-first within that type only.
- **Vacating with a balance.** Vacating a tenant who still owes money shows a warning but is allowed. A former tenant with a balance stays in a separate "Left, still owes" section on Home and is counted in the total. Vacating prompts for a final reading so the room's last bill is correct and the next tenant starts from a clean base.

## Constraints

- Free tiers of Vercel and Supabase should be enough. No paid services.
- Next.js on Vercel and Supabase Postgres, as chosen. Everything else (UI library, i18n approach, PWA tooling) is the builder's choice, keeping the app small.
- Works on a mid-range Android phone on mobile data. Large tap targets, large type, no tiny controls.
- The Marathi labels need to read naturally, for example बाकी (pending), जमा (paid), रीडिंग (reading), युनिट (unit), भाडे (rent), लाईट बिल (light bill). The owner should review the Marathi wording.

## Left to the builder

Database schema, how the ledger and allocation are modelled, the i18n and PWA approach, component and routing structure, the exact thresholds for "unusually high" readings, WhatsApp message wording in both languages, testing approach, and deployment setup. Also the content of the Supabase setup guide the owner asked for at the end: create the project, run the schema, set the environment variables on Vercel, and the first-run PIN setup.

## Open items the owner may still decide later

- Whether tenants should eventually get a read-only link to their own bill.
- Whether a tenant's deposit/advance (for example the "जमा" amounts in the light bill notes) needs its own concept or is just a payment.
