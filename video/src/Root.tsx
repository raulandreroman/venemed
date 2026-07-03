import "./index.css";
import { Composition } from "remotion";
import { VenemedPromo, TOTAL_DURATION } from "./Composition";
import { VenemedDonantes, DONOR_DURATION } from "./DonorPromo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="VenemedPromo"
        component={VenemedPromo}
        durationInFrames={TOTAL_DURATION}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="VenemedDonantes"
        component={VenemedDonantes}
        durationInFrames={DONOR_DURATION}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
