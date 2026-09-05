# src/utils/

Small, stateless, dependency-free helper functions shared across more than one feature
(date/number formatting, validation predicates, etc.). Empty in the foundation phase — no
such helper exists yet in an app with no features.

## Convention

A helper used by only one feature belongs alongside that feature instead
(`src/features/<feature>/`) — move it here only once a second feature needs the same
logic. Keep functions here pure (no React, no navigation, no API calls) so they stay
trivially unit-testable.
