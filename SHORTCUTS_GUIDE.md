# Listenly Shortcuts Guide

All shortcuts in Listenly are **GLOBAL** — they work even when your meeting app (Zoom, Teams, Google Meet, etc.) is focused. You don't need to click the Listenly window at all.

## Default Shortcuts

| Action | Shortcut | Works Globally | Notes |
|--------|----------|---|---|
| **Start/Stop Listening** | `Ctrl+Shift+Enter` (Windows) or `Cmd+Shift+Enter` (Mac) | ✅ Yes | Begin or end transcript capture. Press anywhere, any app. |
| **Toggle Overlay** | `Ctrl+Shift+Space` (Windows) or `Cmd+Shift+Space` (Mac) | ✅ Yes | Show/hide the Listenly overlay window. Useful if it's in the way. |
| **Toggle Click-Through** | `Ctrl+Shift+I` (Windows) or `Cmd+Shift+I` (Mac) | ✅ Yes | Allow mouse clicks to pass through the overlay to the app behind. |
| **Toggle Code Panel** | `Ctrl+Shift+G` (Windows) or `Cmd+Shift+G` (Mac) | ✅ Yes | Show/hide the AI code suggestion panel (when enabled). |

## Keyboard Notation

- **Ctrl** (Windows) / **Cmd** (Mac) — The control key (automatically chooses OS version)
- **Shift** — The Shift key
- **Alt** — The Alt key (Windows) or Option key (Mac)
- **+** — Press keys together simultaneously
- **Enter** — The Return/Enter key
- **Space** — Spacebar

**Example**: `Ctrl+Shift+Enter` means:
1. Hold down **Ctrl**
2. Hold down **Shift**
3. Press **Enter**
4. Release all keys

## Where to Find/Change Shortcuts

### In the Overlay (Main Window)
The active shortcuts are displayed at the bottom of the overlay in a pill format:
```
Global Shortcuts:  Listen: Ctrl+Shift+Enter  |  Toggle: Ctrl+Shift+Space  |  Click-through: Ctrl+Shift+I
```

**Hover over the display** to see full descriptions.

### In Settings
1. Open Listenly
2. Click **Settings** (gear icon)
3. Go to **Shortcuts** tab
4. All active shortcuts listed with descriptions
5. Each shortcut works **globally** even when meeting apps are focused

## Common Use Cases

### Scenario 1: Recording a Zoom Meeting
1. **Before meeting**: Open Listenly, set up your preferences
2. **During meeting**: 
   - Press `Ctrl+Shift+Enter` to start listening (don't click anything)
   - Continue with your Zoom call
   - Press `Ctrl+Shift+Enter` again to stop listening
   - Press `Ctrl+Shift+Space` if overlay gets in the way
3. **After meeting**: Review transcript in Listenly

### Scenario 2: Boss Asks "Design REST API"
1. **During call**: Boss asks the question (Listenly is recording)
2. **Your response**:
   - Press `Ctrl+Shift+Enter` to ensure listening (if not already)
   - Or: Press `Ctrl+Shift+G` to toggle code suggestions (if enabled)
3. **No mouse clicks needed** — all keyboard-driven

### Scenario 3: Screen Sharing (Don't Show Listenly)
1. **When sharing screen**: Press `Ctrl+Shift+I` to toggle click-through
2. **Or**: Press `Ctrl+Shift+Space` to hide overlay entirely
3. Resume your presentation
4. Press again to show overlay when screen-share ends

## Troubleshooting

### "Shortcut Doesn't Work"

**Check 1: Is Listenly running?**
- Look for Listenly in system tray
- If not running, start it first

**Check 2: Is another app claiming the shortcut?**
- Some apps (Discord, Chrome extensions, game launchers) claim common shortcuts
- Go to Settings → Shortcuts tab
- Look for warning message if shortcut failed to register
- Try changing to a less common combination (e.g., `Ctrl+Shift+L` instead of `Ctrl+Shift+Space`)

**Check 3: Is it the right OS key?**
- Windows: Use `Ctrl`
- Mac: Use `Cmd`
- If you use the wrong one, shortcut won't work

**Check 4: Try disabling other apps temporarily**
- Discord overlay conflicts often
- Game launchers (Steam, Epic) can claim shortcuts
- Accessibility tools sometimes intercept

### "Overlay Stuck in Click-Through Mode"

If clicks are passing through to the app behind:
- Press `Ctrl+Shift+I` to toggle click-through back off
- Or open Settings → Overlay and toggle "Click-through" manually

### "Can't See Shortcut Keys in Overlay"

If the shortcut display is missing from the bottom of the overlay:
- Click Settings → Overlay
- Make sure "Show shortcut hints" is ON (enabled)
- Restart Listenly

## Advanced: Changing Shortcuts

### Why Change a Shortcut?
- Another app already uses it
- You prefer a different key combo
- You want something easier to remember

### How to Change

1. **In Overlay** (quick):
   - Look for shortcut display at bottom
   - Click the shortcut key you want to change
   - Press your new key combination
   - Confirm

2. **In Settings** (detailed):
   - Open Settings tab → Shortcuts
   - Find the action you want to change
   - Click the key combo field
   - Press your new combination
   - Save

### Valid Key Combinations

**Modifiers** (one or more required):
- `Ctrl` / `Cmd`
- `Shift`
- `Alt` / `Option`

**Special Keys**:
- Letters: A-Z
- Numbers: 0-9
- Function keys: F1-F12
- `Space`, `Enter`, `Tab`, `Escape`
- Arrow keys: `Up`, `Down`, `Left`, `Right`
- `Home`, `End`, `Page Up`, `Page Down`

**Invalid Combinations**:
- Single key alone (must have modifier like Ctrl or Shift)
- Multiple modifiers without a key (e.g., `Ctrl+Shift` alone won't work)

### Recommended Shortcuts (if defaults conflict)

If `Ctrl+Shift+Enter` doesn't work:
- Try: `Ctrl+Shift+L` (mnemonic: **L**isten)
- Try: `Ctrl+Shift+R` (mnemonic: **R**ecord)

If `Ctrl+Shift+Space` doesn't work:
- Try: `Ctrl+Shift+O` (mnemonic: **O**verlay)
- Try: `Ctrl+Shift+V` (mnemonic: V for "**V**isible")

## Getting Help

### Where to Look
1. **In Listenly**:
   - Settings → Shortcuts tab → Hover over entries for descriptions
   - Overlay → Bottom bar shows active shortcuts
   - Look for ⓘ info icons for context

2. **System Tray**:
   - Right-click Listenly icon → Settings
   - Or: Left-click tray icon → Toggle overlay → Look at bottom

### Still Stuck?
- Check if shortcut is registered (Settings → Shortcuts should show ✓)
- Try restarting Listenly
- Check system logs (Settings → Help → Open logs)

---

**Key Takeaway**: Listenly's global shortcuts mean you never have to click the mouse during your meeting. Just use your keyboard. Work stays focused on your call, Listenly runs silently in the background.
