# videos

[Remotion](https://remotion.dev) videos for Batchwork — launch and marketing
motion. Dark theme over a teal background texture (`public/background.jpg`),
with frosted-glass code blocks that type themselves out and marker-highlighted
titles. Built with Geist + Geist Mono to match [batchwork.dev](https://batchwork.dev).

## Compositions

| id                    | description                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `BatchworkLaunch`     | ~25s launch video: intro → unified API → AI SDK models → server polling → Next.js → outro    |
| `BatchworkEmbeddings` | ~21.5s light-mode feature video for `batch.embeddings`: intro → code + terminal demo → outro |
| `BatchworkImages`     | ~21.5s light-mode feature video for `batch.images`: intro → code + terminal demo → outro     |

## Develop

```bash
bun run dev      # open Remotion Studio
```

## Render

```bash
bun run render             # → out/batchwork-launch.mp4
bun run render:embeddings  # → out/batchwork-embeddings.mp4
bun run render:images      # → out/batchwork-images.mp4
bun run still              # → out/still.png (first frame)
```

## Structure

```
src/
  index.ts          registerRoot entry
  Root.tsx          <Composition> registration
  Video.tsx         scene sequencing (dip-to-background between scenes)
  theme.ts          dark palette, easing, syntax colors
  lib/              fonts, animation helpers, syntax tokenizer
  components/        Background (bg image + scrim), GlassCodeBlock (typewriter),
                     MarkerHighlight, ProviderRow, InstallPill, SceneText,
                     SplitScene, Scene
  scenes/           Intro, UnifiedApi, AiSdk, Server, NextScene, Outro
```

The glass code block and marker highlight are adapted from
[remocn](https://github.com/kapishdima/remocn). Animations use
`useCurrentFrame()` + `interpolate()`/`spring()` only — no CSS transitions or
Tailwind animation classes (they don't render deterministically).
