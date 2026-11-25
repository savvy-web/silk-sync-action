# Interface

* [The action's inputs and outputs are a frozen public contract](action-contract.md) - action.yml's inputs (app credentials, config-file, custom-properties and/or repos, five flags) and outputs (results JSON plus four scalars) are what every consuming workflow depends on.
* [silk.config.json is validated against an unversioned schema served from main](config-file.md) - SilkConfig ({ $schema?, labels, settings }) is the user config's contract, and silk.config.schema.json, generated from it, lives at the repo root because user configs pin its raw main URL.
