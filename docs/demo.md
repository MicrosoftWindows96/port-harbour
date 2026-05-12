# Recording a demo

Two options. Pick one.

## Option A: vhs (recommended, produces a clean `.gif`)

[charmbracelet/vhs](https://github.com/charmbracelet/vhs) drives a headless terminal from a script. Best for retro-vibe demos: smooth, deterministic, no shaky human typing.

Install:

```sh
brew install vhs                  # macOS
# or
go install github.com/charmbracelet/vhs@latest
```

Build the binary first so vhs runs the release version:

```sh
cargo build --release
```

Record:

```sh
vhs docs/demo.tape
```

Output lands at `docs/demo.gif`. Embed it in `README.md`:

```md
![demo](docs/demo.gif)
```

## Option B: asciinema + agg (text-based, smaller artifact)

```sh
brew install asciinema agg
asciinema rec docs/demo.cast -c "./target/release/portharbour"
# play around, press q to stop
agg docs/demo.cast docs/demo.gif --font-size 14 --theme monokai
```

## Tips

- Run with `--interval 500` for a snappier demo.
- Spin up a few dummy listeners in another terminal before recording so the table has interesting rows:

  ```sh
  python3 -m http.server 8000 &
  nc -l 4242 &
  ```

- The `--no-banner` flag gives you more table space if your recording width is small.
