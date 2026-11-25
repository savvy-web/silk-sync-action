# Gotcha

* [A reversed Effect.partition destructure compiles and silently returns no results](partition-tuple-order.md) - Since effect 4.0.0 partition returns \[passes, fails\]; writing \[fails, passes\] still type-checks because never\[\] is assignable to the result type, and the run reports zero repositories.
* [An act run fails main on missing token state because act skips pre](act-skips-pre.md) - act does not run the pre step of a local ./ action, so main dies on the missing githubToken state; that is the harness, not a broken build.
* [The JSON Schema lowering silently drops a pattern or inlines every optional boolean](schema-lowering.md) - Schema.isPattern exports pattern only for a RegExp with the u flag, and without an identifier annotation every optional boolean setting inlines its own boolean \| null union.
