import { interpolate, useCurrentFrame } from "remotion";

import { MarkerHighlight } from "../components/marker-highlight";
import { SplitScene } from "../components/split-scene";
import { fadeUp } from "../lib/animation";
import { MONO } from "../lib/fonts";
import { COLORS, EASE } from "../theme";

const CODE = `import { createBatchPoller, createMemoryStore } from "batchwork/server";

const poller = createBatchPoller({ store: createMemoryStore() });

await poller.track(job, {
  webhookUrl: "https://acme.com/webhooks/batch",
  secret: process.env.BATCH_WEBHOOK_SECRET,
});

// Run tick() on a schedule — one signed webhook per finished batch.
export const GET = async () => Response.json(await poller.tick());`;

// A small chip that flips from "polling" to "delivered".
const PollStatus = () => {
  const frame = useCurrentFrame();
  const flip = 140;
  const delivered = frame >= flip;

  const pulse = 0.4 + 0.6 * Math.abs(Math.sin((frame / 14) * Math.PI));
  const check = interpolate(frame, [flip, flip + 10], [0, 1], {
    easing: EASE,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        background: "rgba(255,255,255,0.07)",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 999,
        color: COLORS.foreground,
        display: "inline-flex",
        fontFamily: MONO,
        fontSize: 19,
        gap: 12,
        padding: "12px 20px",
        ...fadeUp(frame, 26),
      }}
    >
      <span
        style={{
          background: delivered ? COLORS.emerald : COLORS.accent.blue,
          borderRadius: 999,
          height: 11,
          opacity: delivered ? 1 : pulse,
          transform: `scale(${delivered ? 0.7 + 0.3 * check : 1})`,
          width: 11,
        }}
      />
      {delivered
        ? "batch.completed → webhook delivered"
        : "polling open batches…"}
    </div>
  );
};

export const Server = () => (
  <SplitScene
    body="Register a job once and Batchwork polls open batches for you, delivering one signed webhook when each finishes — using OpenAI's native webhooks where they exist."
    code={CODE}
    extra={<PollStatus />}
    fileName="lib/poller.ts"
    title={
      <>
        Automatic{" "}
        <MarkerHighlight delay={24} markerColor={COLORS.syntax.number}>
          polling &amp; webhooks
        </MarkerHighlight>
        .
      </>
    }
  />
);
