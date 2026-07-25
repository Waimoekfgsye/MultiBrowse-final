# Why antivirus kills MultiBrowse, and how to stop it

Nothing in this app is malicious, but several things it does legitimately
are also the exact things droppers and trojans do. Heuristic engines score
behaviour, not intent, so the fix is to remove the behaviours you don't
need, sign what's left, and build reputation. In rough order of impact:

## 1. The build is unsigned (biggest single cause)

An unsigned Windows executable starts at zero reputation. Defender
SmartScreen blocks it on download, and the heuristic engine treats
everything else the app does with maximum suspicion. Every commercial
competitor — GoLogin, AdsPower, Multilogin — ships signed.

- **OV certificate** (~$200–400/yr, DigiCert / Sectigo / SSL.com): removes
  most detections, but reputation still has to accumulate over a few
  hundred downloads.
- **EV certificate** (~$400–700/yr, hardware token or cloud HSM): immediate
  SmartScreen trust, no reputation warm-up. Worth it if you're selling this.

CI is already wired for it — add these repository secrets and builds sign
themselves:

| Secret | Value |
|---|---|
| `WIN_CSC_LINK` | `base64 -w0 yourcert.pfx` |
| `WIN_CSC_KEY_PASSWORD` | the .pfx password |
| `MAC_CSC_LINK` / `MAC_CSC_KEY_PASSWORD` | Developer ID cert, for macOS |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | notarization |

Without them the build still succeeds, just unsigned.

## 2. Rewriting an .exe at runtime — now off by default

`patchExeIcon()` ran `rcedit.exe` against each profile's copied browser
binary to change its icon. Modifying the resource section of a PE file on
disk is textbook resource-patching malware behaviour and scores very
heavily, and it wasn't buying much: `writeProfileWindowIcons()` already
sets the taskbar, Alt-Tab and window icon through Firefox's own
`chrome/icons/default` mechanism, on all three platforms. All rcedit added
was the icon Explorer draws on the file itself.

It's now behind `MULTIBROWSE_PATCH_EXE_ICON=1`, and `rcedit.exe` is no
longer downloaded in CI or packed into the Windows resources.

The file icon it used to provide is now supplied by `writeProfileShortcut()`,
which writes a `.lnk` per profile into the profile folder. A shortcut stores
its own icon, so Explorer draws the profile badge without a single byte of
the `.exe` changing — and the user gets something they can pin to the
taskbar or Start menu that opens one specific profile.

## 3. Portable build runs from %TEMP%

The portable target unpacks itself to `%TEMP%` and executes from there —
"executable writes an executable to temp and launches it" is a standard
detection signature. The NSIS installer is now the first Windows target;
keep the portable build if customers ask for it, but point downloads at
the installer.

## 4. Behaviours that remain, and what to tell vendors

These are inherent to what the app does. They can't be removed, only
explained in a false-positive report:

- Downloading a ~200 MB browser engine at runtime and extracting it into
  `%APPDATA%` — classic downloader shape.
- Copying that engine per profile (`ensureProfileBinaryCopy`) — mass
  creation of executable files.
- Patching `omni.ja` and `.cfg` files inside the engine
  (`searchEngineFix.cjs`, `patchCamoufoxCfg`) — modifying another
  application's files.
- Spawning detached child processes and killing process trees via
  `taskkill`.

Two things make these look much better: fetch the engine only over HTTPS
from the pinned upstream release URL, and **verify a SHA-256 of the
download before extracting**. A checked hash is the single strongest
argument in a false-positive appeal, because it proves the app can't be
turned into a delivery vector for something else.

## 5. Submit false-positive reports

Do this for every release, per vendor. They're free and usually turn
around in 24–72 hours:

- Microsoft Defender: <https://www.microsoft.com/en-us/wdsi/filesubmission>
  (choose "Software developer", submit the installer *and* the portable exe)
- Kaspersky: <https://opentip.kaspersky.com/>
- Avast/AVG: <https://www.avast.com/false-positive-file-form.php>
- Bitdefender: <https://www.bitdefender.com/consumer/support/answer/29358/>
- ESET: `samples@eset.com`
- VirusTotal: upload each release and keep the link — it shows you which
  engines to chase, and comment as the vendor with a link to the repo.

## 6. Things not to do

Don't pack with UPX, don't obfuscate the JS bundle, don't strip version
metadata, and don't try to detect or work around the scanner. All of it
raises the score rather than lowering it, and it makes the false-positive
report unwinnable — the vendor can no longer tell your build apart from a
real one.

## Quick checklist per release

1. Build in CI with signing secrets present.
2. Confirm the installer is signed: `signtool verify /pa /v MultiBrowse-2.0.0-Setup.exe`
3. Upload to VirusTotal, note which engines flag it.
4. Submit false positives to those engines.
5. Publish the SHA-256 of each artifact on the download page.
