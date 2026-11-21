---
"@savvy-web/silk-sync-action": patch
---

## Features

* The run log is organized into **Discovery** and **Sync** phases. Each unit of work, including every repository, is its own collapsible step that ends in one result line, such as `✓ acme/api · labels 2 created · 1 setting changed · 1.4s`
* A repository whose sync recorded errors is marked `✗`, with its first error on the result line and its log shown unfolded. The run still continues and reports it in the outputs as before
* A closed or missing project is reported once, as a warning on the `Resolve projects` step
