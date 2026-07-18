import { Schema } from "effect";
import { NonEmptyString } from "./schemas.js";

export class InvalidInputError extends Schema.TaggedErrorClass<InvalidInputError>()("InvalidInputError", {
	field: NonEmptyString,
	value: Schema.Unknown,
	reason: NonEmptyString,
}) {
	get message(): string {
		return `Invalid input for "${this.field}": ${this.reason}`;
	}
}

export class DiscoveryError extends Schema.TaggedErrorClass<DiscoveryError>()("DiscoveryError", {
	reason: NonEmptyString,
}) {
	get message(): string {
		return `Repository discovery failed: ${this.reason}`;
	}
}
