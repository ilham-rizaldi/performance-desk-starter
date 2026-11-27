# Performance Desk Starter

Performance Desk combines Garmin Connect and Intervals.icu data into a personal training dashboard. See how your load and recovery are changing, choose an easy session, and compare your estimated heart rate with what you actually recorded.

[Setup prompt for Codex](SETUP-PROMPT.md) · [Connection and troubleshooting guide](SYNC.md) · [Open the GitHub Pages preview](https://ilham-rizaldi.github.io/performance-desk-starter/)

## Get started

1. On GitHub, choose **Code → Download ZIP** and extract it. Install [Node.js LTS](https://nodejs.org/) if needed. Use Node.js 20 or newer.
2. In Terminal, open the extracted folder. Run `npm ci` to install the FIT decoder, then `npm start` to run the app. If you use Codex desktop, you can give it the [setup prompt](SETUP-PROMPT.md) to do this for you.
3. Open [your local dashboard](http://127.0.0.1:4176/) and choose **Connect accounts**. Add a key from your account settings for Garmin Connect, Intervals.icu, or both. Check **Last synced** to confirm the first update.

Keep the local app running for automatic updates. To start it again, open the same folder and run `npm start`. The [connection guide](SYNC.md) shows where to find your keys and how to refresh your data.

## Find your way around

| Tab | What you can do |
|---|---|
| **Daily** | Read the Coach’s Summary, Training Load, Workout Suggestion, and Training Status. Check sleep, readiness, recovery, Body Battery, and heart metrics when available. Find Adaptive Workout just below Body metrics. |
| **Trends** | Compare training load, Fitness, Fatigue, and Form. Check Load Focus and switch Heart metrics between RHR, HRV, and both. See strength volume and named exercise records when available. |
| **Archive** | Choose a date to see its activities and readings. |
| **Reference** | Check data coverage and review available threshold estimates or settings. |

Choose **Details** on a card for a closer look. **Historical data** opens the underlying table when the card has a history. For charts with an interactive cursor, hover, tap, or use the arrow keys to inspect individual points.

## Try Adaptive Workout

1. On **Daily**, choose **Cycling** or **Running**, then **Outdoor** or **Indoor**. Enter a steady power or pace, duration, and HR ceiling. The card uses the recovery readings available for that day to guide the next easy effort.
2. Choose **Save pre-workout target** before you start. If you have comparable efforts near the target on at least two earlier days, the card can estimate HR. The range shows what happened on those days.
3. Sync after the session. A uniquely matched steady effort from a session started after you saved can be compared with the target. Check actual HR and time above your ceiling in that block. Add an optional RPE, then choose **Save result**.
4. In **Trends → Workout review**, see how close your estimates were to actual HR. A separate weekly comparison appears when both weeks have enough steady efforts at similar HR.

## What to test

- Confirm the date and recent readings in **Daily** after connecting your account.
- Try all three views in **Trends → Heart metrics**, then open **Details** and expand **Historical data**.
- In **Adaptive Workout**, try an easy target you have previously recorded. Check that the estimate names its evidence from comparable days or explains what data is missing. For the full comparison, save a target before a real session and review the result afterward.

## Preview, files, and privacy

The [GitHub Pages preview](https://ilham-rizaldi.github.io/performance-desk-starter/) opens the public dashboard shell. You can use **Open report file** there to inspect a report you already have. Account connections and Adaptive Workout require the local app. The [report format](DATA-FORMAT.md) and [empty report template](report.blank.json) describe the import.

Your account keys, synced data, and private archive stay with your local app. Saved workout targets and reviews stay in the browser where you saved them. The app reads your accounts. You can remove a connection with **Disconnect**. [How to connect and disconnect](SYNC.md)
