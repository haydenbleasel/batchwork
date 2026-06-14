import { Features } from "@/components/sections/features";
import { Hero } from "@/components/sections/hero";
import { getLatestVersion } from "@/lib/version";

const Home = () => (
  <>
    <Hero latestVersion={getLatestVersion()} />
    <Features />
  </>
);

export default Home;
