import { MarkerHighlight } from "../components/marker-highlight";
import { SplitScene } from "../components/split-scene";
import { COLORS } from "../theme";

const CODE = `import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";

// Pass the AI SDK models you already use.
batch({ model: openai.chat("gpt-5.5"), requests });
batch({ model: anthropic("claude-opus-4-8"), requests });

// ...or a plain provider/model string.
batch({ model: "openai/gpt-5.5", requests });`;

export const AiSdk = () => (
  <SplitScene
    body="Author requests in the same generateText shape you already know. Pass any AI SDK model — swap a single line to change providers."
    code={CODE}
    fileName="models.ts"
    reversed
    title={
      <>
        Works with any{" "}
        <MarkerHighlight delay={24} markerColor={COLORS.syntax.keyword}>
          AI SDK model
        </MarkerHighlight>
        .
      </>
    }
  />
);
