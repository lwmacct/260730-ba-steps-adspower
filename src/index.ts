import { defineStepPack } from "@lwmacct/260729-ba-framework/pack";
import createBrowser from "./steps/create-browser.js";

export default defineStepPack({
  id: "adspower/core",
  steps: [createBrowser],
});
