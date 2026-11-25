# Measurement

* [A test-file edit still invalidates the build:prod cache](test-edit-cache-miss.md) - Moving tests from src/ to \_\_test\_\_/ did not isolate the bundle from test edits, because build:prod depends on types:check, which must cover \_\_test\_\_.
* [Bundles are about 500 kB main and 353 kB pre/post, with no confined packages](bundle-size.md) - Measured 2026-11-25 on effect 4.1.5 and @effected/github-actions 0.38.1 under rolldown; azure, cyclonedx, sigstore and xmlbuilder each occur zero times in every entry.
