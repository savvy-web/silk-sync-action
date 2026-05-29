import { Action } from "@savvy-web/github-action-effects";
import { MainLive } from "./layers/app.js";
import { program } from "./program.js";

/* v8 ignore next 3 */
if (process.env.GITHUB_ACTIONS) {
	await Action.run(program, { layer: MainLive });
}
