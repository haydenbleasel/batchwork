import { MarkerHighlight } from "../components/marker-highlight";
import { SplitScene } from "../components/split-scene";
import { COLORS } from "../theme";

const CODE = `import { createBatchRoutes, createMemoryStore } from "batchwork/next";

export const batches = createBatchRoutes({
  store: createMemoryStore(),
  onComplete: async (event, results) => {
    for await (const r of results) {
      await db.results.upsert({ id: r.customId, text: r.text });
    }
  },
});

// app/api/batches/route.ts
export const { GET, POST } = batches;`;

export const NextScene = () => (
  <SplitScene
    body="Export App Router route handlers for cron ticks and native webhooks. onComplete runs in-process, so results land straight in your database."
    code={CODE}
    fileName="lib/batches.ts"
    reversed
    title={
      <>
        Drop straight into{" "}
        <MarkerHighlight delay={24} markerColor={COLORS.syntax.type}>
          Next.js
        </MarkerHighlight>
        .
      </>
    }
  />
);
