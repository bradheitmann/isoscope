/* Fixture for chrome-profile-cleanup.test.ts: creates a profile dir, reports it, then idles until signalled. */
import { chromeProfileDir } from "../../scripts/cli";

console.log(chromeProfileDir("fixture"));
setInterval(() => {}, 1000);
