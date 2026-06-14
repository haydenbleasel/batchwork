import { CodeDemo } from "@/components/sections/code-demo";
import { FeatureSections } from "@/components/sections/feature-sections";
import { Hero } from "@/components/sections/hero";
import { getLatestVersion } from "@/lib/version";

const Home = () => (
  <>
    <Hero latestVersion={getLatestVersion()}>
      <CodeDemo />
    </Hero>
    <FeatureSections />
  </>
);

export default Home;
