INTERNAL

# Scout Camp Island: playtest 1 (itch.io, private)

Desktop browsers only (Chrome, Safari, Firefox), keyboard and mouse. Mobile and touch are not supported.

## Build and zip

```
npm install
npm run build                      # writes dist/ (base './', relative paths, only index.html)
cd dist && zip -r ../release/scout-camp-island-playtest-1.zip . && cd ..
```

`release/` and `dist/` are git-ignored. The zip must have `index.html` at its root (the command above does that). Check the build locally with `npx vite preview --port 4173`. Bump the label in `src/config.js` (`VERSION_LABEL`) for the next round.

## itch.io upload settings

- Kind of project: HTML
- Upload the zip; tick "This file will be played in the browser"
- Viewport size: 1512 x 982, or leave a size and turn on "Fullscreen button" (recommended: both)
- SharedArrayBuffer support: off (the game does not use it)
- Mobile: not supported (do not tick any mobile option)
- Visibility: Restricted or Draft with a password, since this is a private playtest
- Feedback link: set `FEEDBACK_URL` in `src/config.js` to your form or page, rebuild, re-zip. While it is an empty string the "Send feedback" button is hidden.

## How to play (text for the itch page)

You are a scout on a small camp island. Explore the camp, jungle, river and village, talk to people, photograph animals, clean up litter and follow the camp timetable.

- W A S D: move. Shift: switch walk / run. Space: hop
- E: use, pick up, talk. F: join in. X: sit
- Mouse drag, or C: free look. Scroll: zoom
- B: backpack. J: journal. M: map. 1-8: quick bar
- Tab: menu. Esc: pause

Best in a desktop browser with hardware acceleration on. Click the game once so it gets the keyboard. Settings (Graphics, Battery saver, Invert zoom scroll) are in the pause menu.

## Known issues

- First load builds the whole island on one thread: expect about 3 s on a fast Mac (measured 2.7 s in a local preview), longer on slow machines. A "Building the island..." text appears after 8 s.
- Heavy for integrated GPUs; use Graphics Low or Battery saver if the frame rate drops. (ASSUMPTION: low-end laptops will struggle; not tested.)
- Much of the game has been checked by screenshots rather than long play sessions, so expect rough edges.
- Progress and settings are saved in the browser's local storage. Private windows or blocked storage keep them for the session only.
- Not tested in Safari or Firefox by the build agent (headless Chrome only).

## What to ask testers

1. Browser, OS, computer, and roughly how long the first load took.
2. Did it stay smooth? Where did the frame rate drop?
3. Did you find the controls without help? Which key did you not discover?
4. Did you know what to do in the first 10 minutes? Where did you get stuck?
5. What was the most fun moment, and the most confusing or boring one?
6. Any bugs: stuck on scenery, missing sound, odd camera? Where on the island?
7. Was scroll zoom in the right direction (camera and telescope)? If not, try the Invert zoom scroll setting.
