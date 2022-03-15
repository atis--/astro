# atis/renderer-grommet

This is a plugin for [Astro][astro] apps that enables server-side rendering of Grommet React components.

## Installation

Install `@atis/renderer-grommet` and then add it to your `astro.config.mjs` in the `renderers` property:

```
npm install @atis/renderer-grommet
```

__astro.config.mjs__

```js
export default {
  renderers: [
    '@atis/renderer-grommet'
  ]
}
```

## Documentation

[Astro Renderer Documentation][renderer-docs]

[astro]: https://astro.build
[renderer-docs]: https://docs.astro.build/reference/renderer-reference
