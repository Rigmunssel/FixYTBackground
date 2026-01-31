# AMO Validation Errors Log

Common errors encountered when submitting Firefox extensions to addons.mozilla.org.

## Errors We Fixed

### 1. Invalid file name in archive (backslashes)
**Error:** `Invalid file name in archive: scripts\content.js`

**Cause:** Windows PowerShell `Compress-Archive` creates ZIP files with backslashes (`\`) in paths.

**Fix:** Use .NET `ZipArchive` API and manually specify entry names with forward slashes:
```powershell
$entry = $zip.CreateEntry("scripts/content.js")
```

### 2. Invalid extension ID
**Error:** Extension ID rejected

**Cause:** Using `@example.com` or invalid domain in `browser_specific_settings.gecko.id`

**Fix:** Use a domain you control:
```json
"id": "your-extension@yourusername.github.io"
```

### 3. Missing data_collection_permissions
**Error:** `The "data_collection_permissions" property is missing.`

**Cause:** AMO requires explicit declaration of data collection intent (as of 2025+)

**Fix:** Add to manifest.json:
```json
"data_collection_permissions": {
  "required": false
}
```

## Checklist Before Uploading

- [ ] All ZIP paths use forward slashes (`/` not `\`)
- [ ] Extension ID uses a real domain you control
- [ ] `data_collection_permissions` is declared
- [ ] No `@example.com` in any field
- [ ] No obfuscated/minified code (reviewers flag this)
- [ ] No "YouTube" in extension name (only in description)
- [ ] Don't mention "Premium" or "bypass" in description
- [ ] Icons are valid PNG or SVG files
- [ ] `strict_min_version` is set appropriately

## Build Command
Always rebuild XPI after manifest changes:
```
.\build.bat
```
