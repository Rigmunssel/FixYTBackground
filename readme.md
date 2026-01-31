# Backstage Play

A lightweight Firefox extension that enables seamless multitasking by preventing tab-suspension during video playback on youtube.com.

## Features

- Prevents video pause when switching tabs or apps
- Minimal permissions — only runs on youtube.com
- No data collection, no external connections
- Open source and human-readable code

## Installation

### Firefox for Android (Custom Collection Method)

Since Firefox for Android restricts extensions, use the **Custom Collection** method:

1. Open Firefox for Android
2. Go to **Settings → About Firefox**
3. Tap the Firefox logo **5 times** to enable debug menu
4. Go back to **Settings → Custom Add-on collection**
5. Enter the Collection Owner ID and Collection Name (provided by the extension author)
6. Restart Firefox and find the extension in **Add-ons**

### Firefox Desktop

1. Download the latest `.xpi` from [Releases](../../releases)
2. Open Firefox and go to `about:addons`
3. Click the gear icon → **Install Add-on From File**
4. Select the downloaded `.xpi` file

### Load Temporarily (Development)

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select the `manifest.json` file from this project

## Android Battery Optimization

For reliable background playback on Android, disable battery optimization for Firefox:

1. Go to **Settings → Apps → Firefox**
2. Tap **Battery**
3. Select **Unrestricted** (or disable battery optimization)

Without this, Android may kill Firefox in the background regardless of this extension.

## Project Structure

```
├── manifest.json        # Extension manifest (Manifest V3)
├── scripts/
│   └── content.js       # Core visibility override logic
├── icons/
│   └── icon.svg         # Extension icon
├── LICENSE              # GPL-3.0 License
└── README.md
```

## How It Works

The extension intercepts visibility state checks by:

1. Overriding `document.visibilityState` to always return `'visible'`
2. Overriding `document.hidden` to always return `false`
3. Blocking `visibilitychange` events from reaching page scripts
4. Preventing Media Session pause handlers from interrupting playback

## Building for Distribution

### Create XPI Package

```bash
cd FixYTBackground
zip -r backstage-play.xpi manifest.json scripts/ icons/ LICENSE -x "*.git*"
```

### Submit to AMO (Unlisted)

1. Go to [addons.mozilla.org](https://addons.mozilla.org)
2. Sign in and go to **Developer Hub**
3. Click **Submit a New Add-on**
4. Choose **On your own** (unlisted) for faster approval
5. Upload your `.xpi` file

## License

GPL-3.0 License — See [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please keep the code minimal and readable.
