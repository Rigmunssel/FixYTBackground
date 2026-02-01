# Backstage Play

Play YouTube videos in the background on Android Firefox.

## Installation

### Option 1: Firefox Developer Edition (Will be available for normal firefox as extension when I get it approved)

1. Install **Firefox Nightly** from Play Store
2. Go to `about:config` (you type this into your firefox search bar)
3. Set `xpinstall.signatures.required` to **false** 
4. Go to **Settings** → **About Firefox Nightly**
5. Tap the Firefox logo **5 times** to enable debug menu
6. Install `backstage-play.xpi` to your device.
7. Go back to **Settings** → **Install extension from file**
8. Select the file `backstage-play.xpi` (rename the file-extension from`.xpi` to `.zip` if file appears greyed out)
9. If this works for you, you owe me a star :D

Security Notice: > By setting xpinstall.signatures.required to false, you are disabling Firefox’s built-in protection that prevents unverified code from running.

Why this is needed: My extension is currently under manual review by Mozilla. Until it is approved, it is technically "unsigned." 
However the whole project is fully open source so you can confirm yourself that there is nothing nasty in there :).


### Option 2: Regular Firefox (After Approval)

Once approved by Mozilla, install directly from Firefox Add-ons.

## Usage

1. Open **youtube.com** in Firefox (not the YouTube app)
2. Play a video
3. Switch apps or turn off screen
4. Audio continues playing ✓

## License

GPL-3.0
