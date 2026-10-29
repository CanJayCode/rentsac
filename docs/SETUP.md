# Rentsac setup guide

Plain steps to put Rentsac on the real database and on the phones. Do them in order. Each step says what you should see. Commands are for Windows PowerShell, run inside the `rentsac` folder.

You need: the Supabase project (already made), a free Vercel account, Node.js, and this folder with `npm install` done.

## 1. Set up the database (Supabase)

The project already exists: https://awdyxososvvxgsrigurz.supabase.co

1. Open the project in the Supabase dashboard. In the left menu click **SQL Editor**, then **New query**.
2. Open the file `supabase/schema.sql` from this folder, select everything, copy it, paste it into the editor and click **Run**.
   You should see "Success. No rows returned". It is safe to run again; it does not delete anything.
3. Check it worked: click **Table Editor**. You should see 9 tables (rooms, tenants, charges, payments, rounds, readings, main_readings, settings, auth_attempts). Open `rooms`: it should have 16 rows, numbered 1 to 16.
4. Get the two values the app needs. Open **Project Settings, then API Keys**:
   - The project URL: `https://awdyxososvvxgsrigurz.supabase.co`
   - The **secret** key (also called `service_role`). Do NOT use the publishable (anon) key.
5. The secret key is a password to all the data. It goes in only two places: the file `.env.local` and Vercel. Never in git, never in a chat, never in an email.

**If the secret key was ever pasted into a chat** (it was pasted into a Claude chat once), treat it as leaked. In Supabase go to Project Settings, API Keys, and rotate (regenerate) the secret key. Then put the new key in `.env.local` and in Vercel (step 3). The old key stops working at once.

## 2. Run it on your computer with the real database

1. Create the file `.env.local` in the `rentsac` folder (git ignores it). Put these four lines in it, with your own values:

   ```
   REPO=supabase
   SUPABASE_URL=https://awdyxososvvxgsrigurz.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=paste-the-secret-key-here
   SESSION_SECRET=paste-a-long-random-string-here
   ```

2. Make the random string for `SESSION_SECRET` with this command and paste its output:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   You should see 64 letters and digits. It signs the login cookie. Keep it private. Use the same value in Vercel.

3. Check the database. This only reads; it changes nothing:

   ```powershell
   npm run check:db
   ```

   You should see `OK` next to each of the 9 tables, then the last line `OK: all 9 tables are reachable and there are 16 rooms.`
   If you see `FAIL`, do not go on. Read the message. "Could not find the table" means step 1 was not done (run `supabase/schema.sql` again). "Invalid API key" means the secret key is wrong or was rotated. If it lists missing variables, fix `.env.local`.

4. Start the app:

   ```powershell
   npm run dev
   ```

   Open http://localhost:3000. The first time, it asks you to choose a PIN.

## 3. Put it online (Vercel)

1. Log in and link the folder to a Vercel project (accept the defaults):

   ```powershell
   vercel login
   vercel link
   ```

2. Invent a short temporary setup code (about 6 letters or digits, for example `k7m2qx`). Add the settings one at a time. Each command asks you to type the value:

   ```powershell
   vercel env add REPO production
   vercel env add SUPABASE_URL production
   vercel env add SUPABASE_SERVICE_ROLE_KEY production
   vercel env add SESSION_SECRET production
   vercel env add SETUP_CODE production
   ```

   The values are: `supabase`, the project URL, the secret key, the same `SESSION_SECRET` as in `.env.local`, and your invented setup code.

3. Deploy:

   ```powershell
   vercel --prod
   ```

   At the end it prints the address of your app (an https address).

4. **Open that address right away** and choose the PIN. It asks for the setup code first. Type the one you invented, then choose the PIN.
5. Now remove the setup code and deploy again:

   ```powershell
   vercel env rm SETUP_CODE production
   vercel --prod
   ```

Why the setup code: until a PIN exists, the first person to open the address could choose the PIN and lock you out. With the setup code, only someone who knows it can do that. After the PIN exists the code is not needed, so remove it.

Security notes:
- Wrong PIN attempts are limited per network address. After too many wrong tries, that address has to wait.
- The limit relies on the `x-forwarded-for` header. Vercel sets it itself and overwrites any value a visitor sends. Please confirm this in Vercel's current documentation when you set up.

## 4. Put the app on the phones

- Android (Chrome): open the https address, tap the menu (three dots), then **Add to Home screen**.
- iPhone (Safari): open the address, tap **Share**, then **Add to Home Screen**.

You should see a Rentsac icon on the home screen. Tell your father the PIN in person, not by message.

## 5. Import the old meter readings (once)

Only the readings in Sheet3 of the Excel file are imported. Tenants, rent and payments are not. Your father adds the tenants in the app.

Do this BEFORE the first real reading round. The first round bills the units used since the last reading the app knows. Without the import, the app has nothing to compare with.

1. Dry run first. It reads the file and prints a report. It writes nothing:

   ```powershell
   node --env-file=.env.local --import tsx --conditions=react-server scripts/import-excel.ts "C:\path\to\your-file.xlsx" --dry-run
   ```

2. Read the report. Check the last reading for each room against the real meters, and read every warning.
3. Only if it looks right, run it for real. It asks you to type `IMPORT`:

   ```powershell
   node --env-file=.env.local --import tsx --conditions=react-server scripts/import-excel.ts "C:\path\to\your-file.xlsx" --apply
   ```

Running it twice is safe; it does not add the same rounds again.

## 6. Forgot the PIN, and backups

Forgot the PIN: in Supabase open **Table Editor**, table `settings`, and delete the row `pin_hash`. The next visit to the app asks for a new PIN. If `SETUP_CODE` is not set in Vercel, anyone who opens the address can then choose the PIN, so do this quickly, or add `SETUP_CODE` again first (step 3, then deploy).

Backups: the Supabase free plan does not promise backups you can download. Once a month, in **Table Editor**, export these tables as CSV and keep them somewhere safe: `tenants`, `charges`, `payments`, `readings`.

## 7. Known limits (please read)

- Only the newest reading round can be corrected. Older rounds cannot be changed.
- The Marathi wording was written by an AI, not a native speaker. Please have someone read it. Words the reviews flagged: "देय", "बदल करा", "पक्के करा", "इन्स्टॉल" (all in `lib/i18n/mr.ts`), and the WhatsApp message wording in `lib/share.ts`.
- The Supabase code and the schema were written but never run against a real database before this guide. Run `npm run check:db`, then do a first-day smoke test in the app: add a tenant, record a payment of 1 rupee, delete that payment, and start a reading round. If anything shows an error, stop. Run `npm run check:db` again. Check that `.env.local` (and Vercel) have the right URL and secret key, and that `supabase/schema.sql` ran fully. If it still fails, note the exact error text and which step, and ask for help before entering real data.
- Tenants have no login. Only you and your father use the app, with the PIN.
- There are no automatic reminders. You send bills yourself, by WhatsApp from the app.
