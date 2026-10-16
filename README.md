# Respawn Beats

A small, animated, offline music player that doubles as a decorative desktop widget. Built with Electron for Windows.

## Features

- Plays your own audio files (mp3, flac, wav, ogg, opus, m4a, aac), fully offline
- Audio-reactive waveform, with bass in the centre and treble toward the edges
- Smooth fade-out on pause and fade-in on play
- Loop modes: off, loop all, loop one song
- Volume control: hover slider, mute button, and scroll wheel over the card (remembered between launches)
- Themes: four presets plus a custom colour wheel that recolours the whole widget live
- Decoration mode: shrinks into a capsule that shows only the waveform, with animated transitions
- Frameless, draggable, optional always-on-top; right-click for the menu

## Run from source

Requires [Node.js](https://nodejs.org) (LTS).

```
npm install
npm start
```

## Build the Windows installer

```
npm run dist
```

The installer is created in the `dist` folder.

## Controls

| Action | How |
| --- | --- |
| Add songs | Queue button, or right-click, then Add songs |
| Move the widget | Drag any empty part of the card |
| Volume | Hover the speaker icon, or scroll over the card |
| Decoration mode / Widget mode | Right-click menu |
| Theme, always on top, quit | Right-click menu |

## Credits

The Outfit font is bundled under the SIL Open Font License.
