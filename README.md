# Performance Desk Starter

Performance Desk combines Garmin Connect and Intervals.icu data into a personal training dashboard. See how your load and recovery are changing, choose an easy session, and compare your estimated heart rate with what you actually recorded.

[Copy the install prompt for Codex](SETUP-PROMPT.md) · [Connection and troubleshooting guide](SYNC.md) · [Open the GitHub Pages preview](https://ilham-rizaldi.github.io/performance-desk-starter/)

## Easiest install with Codex

1. Copy the [install prompt](SETUP-PROMPT.md) into a new **Codex desktop** chat. Codex can download, test, and start the local app.
2. In the dashboard, choose **Connect accounts**. Connect Garmin, Intervals.icu, or both. Paste each key into the local app. On a narrow screen the button reads **Accounts**.
3. Check **Last synced** in the connection window and look for your first readings in **Daily** or **Archive**. The app syncs automatically while it’s running. **Sync now** requests a refresh.

## Manual install

1. Install the current [Node.js LTS](https://nodejs.org/) if needed. On GitHub, choose **Code → Download ZIP** and extract the folder.
2. Open that folder in Terminal or PowerShell. Run `npm ci`, wait for it to finish, then run `npm start`.
3. Open [Performance Desk on this computer](http://127.0.0.1:4176/) and follow the [connection guide](SYNC.md). To reopen the app later, run `npm start` again from the same folder.

## Find your way around

| Tab | What you can do |
|---|---|
| **Daily** | See the workout suggestion and its reason, then check Training Load, Training Status, and Body metrics. A dated plan with session steps shows a workout profile and the recorded power or pace targets. Find Adaptive Workout below Body metrics. |
| **Trends** | Compare Training Load, Fitness, Fatigue, and Form. **Load & Recovery** links both charts by date and shows what changed and what the coach recommends. **Session cross-check** compares readings when the same ride or run can be paired. Review Load Focus, heart metrics, and strength records when available. |
| **Archive** | Choose a date to see its activities and readings. |
| **Reference** | Check data coverage and review available threshold estimates or settings. |

Choose **Details** on a card for a closer look. **Historical data** opens the table. Hover, tap, or use the arrow keys on either Training Load chart to see Acute, Chronic, Ratio, and both optimal ranges in one tooltip. Open **Data behind this recommendation** in **Workout suggestion** or **Load & Recovery** to see the available readings and recent workouts. The coach marks **Follow the plan** in green, **Keep it easy** in amber, and **Rest** in red. Follow the plan refers to the session already planned for that day.

## Try Adaptive Workout

1. On **Daily**, choose **Cycling** or **Running**, then **Outdoor** or **Indoor**. Enter a steady power or pace, duration, and HR ceiling. The card uses the recovery readings available for that day to guide the next easy effort.
2. Choose **Save pre-workout target** before you start. If you change your mind, use **Cancel target** to set a different one. If you have comparable efforts near the target on at least two earlier days, the card can estimate HR. The range shows what happened on those days.
3. Sync after the session. A uniquely matched steady effort from a session started after you saved can be compared with the target. Check actual HR and time above your ceiling in that block. Add an optional RPE, then choose **Save result**.
4. In **Trends → Workout review**, see how close your estimates were to actual HR. A separate weekly comparison appears when both weeks have enough steady efforts at similar HR.

## What to test

- Confirm the date and recent readings in **Daily** after connecting your account.
- Try all three views in **Trends → Heart metrics**, then open **Details** and expand **Historical data**.
- In **Adaptive Workout**, try an easy target you have previously recorded. Check that the estimate names its evidence from comparable days or explains what data is missing. For the full comparison, save a target before a real session and review the result afterward.

## Preview, files, and privacy

The [GitHub Pages preview](https://ilham-rizaldi.github.io/performance-desk-starter/) opens the public dashboard shell. Run the local app to connect your accounts, see your reports, and use Adaptive Workout. If you have an older private archive, the [connection guide](SYNC.md#use-an-existing-private-archive) explains how to add it to your local app.

Your account keys, synced data, and private archive stay with your local app. Saved workout targets and reviews stay in the browser where you saved them. The app reads your accounts. You can remove a connection with **Disconnect**. [How to connect and disconnect](SYNC.md)
