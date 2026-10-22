# Digger in the browser, with recordings

Version 01: [v00](../v00_hello_word) and the recording and playback of games
in the DRF format of the original.

A port of [Digger Remastered](../digger) to HTML and JavaScript, with a small
Go server that serves it and keeps the high scores.

The game logic is a close translation of the C sources: the same levels,
monster AI, bags, scoring and timing (12.5 ticks a second). The 16 colour
VGA screen is emulated pixel for pixel, as the game relies on it (fireballs
stop at the pixels they hit, sprites collide by their boxes). The sound is the
original PC speaker code, run through Web Audio.

## Running

    go run .

and open http://localhost:8080, or in Docker:

    docker build -t digger-js .
    docker run -p 8080:8080 -v digger-scores:/data digger-js

Flags:

- `-addr` — address to listen on, `:8080` by default;
- `-scores` — file to keep the high scores in, `scores.json` by default.

The web files are embedded into the binary, so `go build` gives a single
executable.

## Controls

| Key                          | What it does                    |
|------------------------------|---------------------------------|
| Arrows                       | move                            |
| F1, Ctrl, Enter              | fire                            |
| W, A, Z, S and Tab           | player 2 in the simultaneous modes |
| N (title screen)             | change the game mode            |
| Space                        | pause                           |
| Esc, F10                     | back to the title screen        |
| F7 / F9                      | music / sound on and off        |
| + / -                        | faster / slower                 |
| F8                           | save the last game played       |

The game modes are those of the original: one player, two players taking
turns, two players at once, and the gauntlet (two minutes, as many points as
you can) for one or two players. Each mode has its own high score table.

## Recordings

Every game is recorded. "Save last game" (or F8) downloads it as a `.drf`
file; "Play recording" (or dropping a file on the page) plays one back, Esc
stops it. The keys don't move the Digger then, the speed keys still work.

The format is that of the original game (`record.c`): recordings made here
play in it, and the other way around. What is in a DRF file and how to read
it: [DRF.md](DRF.md).

A game played back goes exactly as it did, as the game is deterministic: the
same random numbers, the same order of everything on each tick, down to the
pixels the fireballs hit. One thing a DRF doesn't have is when Escape was
pressed while the Digger was dying: such a recording plays to the end of the
round (the original then goes on reading what is past the end of the file).

## Tests

    go test ./...
    node tests/drf.mjs

The second plays recordings of games of the original (`tests/data`, from its
`tests/data` and `tests/results`) and checks that each ends with the same
score, level and number of ticks as there. `docker build` runs both.

    tests/reference/compare.sh ../../digger <dir with .drf files>

builds the original from its sources in Docker, plays the recordings in it,
then in this port, and compares. All 23 recordings of the original pass,
the longest 565330 ticks (353 levels).

## Layout

    main.go, scores.go     the server: static files and /api/scores
    web/index.html
    web/js/app.js          the page: loading and saving recordings
    web/js/main.js         title screen and game loop       (main.c)
    web/js/record.js       recording and playback           (record.c)
    web/js/digger.js       Diggers, fireballs, emeralds     (digger.c)
    web/js/monster.js      Nobbins and Hobbins              (monster.c)
    web/js/bags.js         gold bags                        (bags.c)
    web/js/drawing.js      the field and what is on it      (drawing.c)
    web/js/sprite.js       sprites and their collisions     (sprite.c)
    web/js/screen.js       the VGA screen                   (sdl_vid.c)
    web/js/sound.js        PC speaker sound and music       (sound_backend.c)
    web/js/input.js        keyboard                         (input.c)
    web/js/scores.js       scores and high score tables     (scores.c)
    web/js/title.js        title screen animation           (title_anim.c)
    web/js/state.js        shared state and the levels      (game.c, def.h)
    web/js/data.js         graphics, generated
    tools/gendata          extracts the graphics from the C sources
    tests/drf.mjs          plays recordings back, checks how they end
    tests/data             recordings of the original and their results
    tests/reference        the original built in Docker, to compare with

`web/js/data.js` is made from the original sources with

    go run ./tools/gendata ../digger > web/js/data.js

## API

- `GET /api/scores?mode=M` — the high scores of a mode, best first:
  `[{"name": "ABC", "score": 1250}, ...]`;
- `POST /api/scores?mode=M` with `{"name": "ABC", "score": 1250}` — adds a
  score, answers with the table.

Modes are `normal1`, `normal2`, `gauntlet1` and `gauntlet2` (the number is
how many Diggers are on the field at once).

## Not ported

Network play (SIP/RTP), eDRF recordings (the newer format, with the state
of the game in them), redefining the keys, CGA graphics and command line
options.
