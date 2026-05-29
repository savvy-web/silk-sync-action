import { Schema } from "effect";

/** Wall-clock start time persisted in `pre`, read in `post` for duration logging. */
export class StartTimeState extends Schema.Class<StartTimeState>("StartTimeState")({
	startedAt: Schema.Number,
}) {}

export const STATE_KEYS = {
	startTime: "startTime",
} as const;
