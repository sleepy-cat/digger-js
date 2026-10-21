# Digger in the browser

A port of [Digger Remastered](../digger) to HTML and JavaScript, with a small
Go server that serves it and keeps the high scores.

The game logic is a close translation of the C sources: the same levels,
monster AI, bags, scoring and timing (12.5 ticks a second). The 16 colour
VGA screen is emulated pixel for pixel, as the game relies on it (fireballs
stop at the pixels they hit, sprites collide by their boxes). The sound is the
original PC speaker code, run through Web Audio.

## Running

    go run .

and open http://localhost:8080. Flags:

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

The game modes are those of the original: one player, two players taking
turns, two players at once, and the gauntlet (two minutes, as many points as
you can) for one or two players. Each mode has its own high score table.

## Layout

    main.go, scores.go     the server: static files and /api/scores
    web/index.html
    web/js/main.js         title screen and game loop       (main.c)
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

Network play (SIP/RTP), recording and playback of games (DRF), redefining the
keys, CGA graphics and command line options.
