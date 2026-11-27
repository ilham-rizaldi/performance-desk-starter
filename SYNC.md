# Connect your training accounts

Use the local app to connect **Garmin Connect Personal API**, **Intervals.icu**, or both. Each person runs their own copy and signs in to their own accounts.

## 1. Start the local app

1. Choose **Code → Download ZIP** from the [starter repository](https://github.com/ilham-rizaldi/performance-desk-starter) and extract the folder.
2. Install [Node.js LTS](https://nodejs.org/) if needed. Open Terminal in the extracted folder. Run `npm ci`, then `npm start`.
3. Open [Performance Desk on this computer](http://127.0.0.1:4176/) and select **Connect accounts**. Leave the app running while you want updates.

## 2. Connect Garmin

1. On the Garmin Connect card, select **Connect**, then **Open provider settings**.
2. Sign in to Garmin if asked. Create a Personal API key.
3. Paste the key directly into the local app and select **Connect and sync**. Check **Last synced** and look for a reading or activity in **Daily** or **Archive**.

When a key expires, use **Reconnect** with a new one. [Garmin Personal API guide](https://developer.garmin.com/gc-developer-program/personal/personal-faq/)

## 3. Connect Intervals.icu

1. On the Intervals.icu card, select **Connect**, then **Open provider settings**.
2. Find your Personal API key in **Settings → Developer Settings**.
3. Paste it into the local app and select **Connect and sync**. Check **Last synced**, then look for Fitness, Fatigue, Form, or an activity.

A personal key can also show planned cycling and running sessions when calendar access is available. [Intervals.icu API guide](https://forum.intervals.icu/t/api-access-to-intervals-icu/609)

If you already run an approved OAuth app, set `INTERVALS_CLIENT_ID` and, if required by your app, `INTERVALS_CLIENT_SECRET` before starting the server. Register `http://127.0.0.1:4176/api/intervals/callback` as the callback. This flow uses PKCE and asks for `ACTIVITY:READ,WELLNESS:READ`. Use a personal key if you want the local starter to read your calendar. [Intervals.icu OAuth guide](https://forum.intervals.icu/t/intervals-icu-oauth-support/2759)

## 4. Check what arrived

- Garmin is checked every **60 minutes** and Intervals.icu every **15 minutes** while the app is running. **Sync now** asks for an earlier check, subject to provider limits.
- Automatic sync covers up to **42 days**. Recent FIT recordings and activity streams are checked in batches. A cycling estimate needs paired HR and measured power. A running estimate needs paired HR and pace, in the same indoor or outdoor context.
- The cards use the readings your connection actually supplies. Readiness, recovery timer, training status, load ranges, and older detailed readings can come from a private archive. The timer shows the remaining time at the recorded check. It includes the time of the check when the archive provides it.
- If an update fails, the app shows the connection status and keeps the last successful reading for that running session.

## If something looks empty

| What you see | What to do |
|---|---|
| **Ready to connect** | Select **Connect** and enter your key in the local app. |
| Access expired or denied | Use **Reconnect**. Check whether your key has expired. |
| **Last synced** is old | Check that the app is running and online, then try **Sync now**. |
| An HR estimate is missing | Choose the right sport and environment. A target needs comparable steady efforts from at least two earlier days. Older recordings may still be processing. |
| The GitHub preview shows empty cards | Start the local app to connect accounts, or use **Open report file** to inspect a saved report. |

## Use an existing private archive

If you have a compatible Performance Desk archive, run `node reference.mjs /path/to/your/private-report.json` in the starter folder and restart the app. This adds older readings and recorded strength sets when they exist. The corresponding source must be connected for its archived readings to appear. This import is optional.

## Disconnect

Use **Disconnect** to remove a connection and its data from the current dashboard. You can revoke a personal key in the provider’s settings. Connection files are kept in the ignored `.private/` folder. Keep keys in the local app and the provider’s own account settings.
