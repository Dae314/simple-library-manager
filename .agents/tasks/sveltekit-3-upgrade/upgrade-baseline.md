# Upgrade Baseline

- Node: v24.21.0
- npm: 11.19.0
- Working tree already contains `npm update --save` changes (package.json + package-lock.json); all in-range updates are applied.

## `npm outdated` (after npm update)

```
Package                 Current  Wanted  Latest  Location                             Depended by
@sveltejs/adapter-node    5.5.7   5.5.7   6.0.0  node_modules/@sveltejs/adapter-node  simple-library-manager
@sveltejs/kit            2.70.3  2.70.3   3.1.0  node_modules/@sveltejs/kit           simple-library-manager
typescript                6.0.3   6.0.3   7.0.2  node_modules/typescript              simple-library-manager
vitest                   4.1.11  4.1.11   5.0.4  node_modules/vitest                  simple-library-manager
```

## Remaining MAJOR upgrades

- @sveltejs/kit 2.70.3 -> 3.1.0
- @sveltejs/adapter-node 5.5.7 -> 6.0.0
- typescript 6.0.3 -> 7.0.2
- vitest 4.1.11 -> 5.0.4

No other outdated packages are reported.
