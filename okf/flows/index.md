# Flow

* [main discovers repositories, syncs each one, then reports](sync-run.md) - The main program: inputs, config, discovery, project resolution, a per-repository sync step that never fails the run, then the step summary and outputs.
* [pre provisions the App token, main uses it, post revokes it](token-lifecycle.md) - The three-phase lifecycle that brackets every run; pre fails fast on missing permissions and post never fails the job.
