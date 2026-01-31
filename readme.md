# Backstage Play

Play YouTube videos in the background on Android.

## Installation (Android)

### Step 1: Enable Custom Collections
1. Open **Firefox** on your Android phone
2. Tap menu (⋮) → **Settings** → **About Firefox**
3. Tap the Firefox logo **5 times** (a message will confirm debug mode enabled)
4. Go back to **Settings**
5. Tap **Custom Add-on collection**
6. Enter:
   - **User ID:** `19716518`
   - **Collection name:** `FixYTBackground`
7. Tap **OK** — Firefox will restart

### Step 2: Install the Extension
1. After restart, tap menu (⋮) → **Add-ons**
2. Find **Backstage Play** and tap **Install**
3. Tap **Add** when prompted

### Step 3: Configure Firefox (Required!)

Firefox has a built-in feature that suspends background media. You must disable it:

1. Open a new tab and type `about:config`
2. Search for `dom.suspend_background_media`
3. Tap the toggle to set it to **false**
4. Search for `dom.audio.capture.enabled`
5. Tap the toggle to set it to **true**

> **Why?** Firefox kills video connections when tabs are backgrounded. These settings prevent that.

### Step 4: Disable Battery Optimization
1. Open Android **Settings** → **Apps** → **Firefox**
2. Tap **Battery** → Select **Unrestricted**

Without this, Android will stop playback when screen is off.

## Usage
1. Open **youtube.com** in Firefox (not the YouTube app)
2. Play a video
3. Switch apps or turn off screen
4. Audio continues playing ✓

## Troubleshooting
- **Video still pauses?** → Make sure you completed Step 3 (Firefox about:config settings)
- **Audio cuts out after a few seconds?** → Check battery optimization is disabled (Step 4)
- **Extension not showing?** → Make sure you entered the User ID and Collection name exactly as shown

## License
GPL-3.0
