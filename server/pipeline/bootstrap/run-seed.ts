import { seedCFBSources } from "./seed-cfb-sources.js";

seedCFBSources().then(() => process.exit(0)).catch(console.error);
