import { describe, it } from "bun:test";

import { LIVE_TEST_TIMEOUT_MS, runLiveVideos } from "./runner";

const MODEL_ID =
  process.env.BATCHWORK_LIVE_XAI_VIDEO_MODEL ?? "grok-imagine-video";
const hasKey = Boolean(process.env.XAI_API_KEY);

describe.skipIf(!hasKey)("xai live video batch", () => {
  it(
    `round-trips video records through ${MODEL_ID}`,
    () => runLiveVideos("xai", `xai/${MODEL_ID}`),
    LIVE_TEST_TIMEOUT_MS
  );
});
