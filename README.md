# @youwol/local-youwol-client

Client for local py-youwol

This library is part of the hybrid cloud/local ecosystem
[YouWol](https://platform.youwol.com/applications/@youwol/platform/latest).

## Links

[Online user-guide](https://l.youwol.com/doc/@youwol/local-youwol-client)

[Developers documentation](https://platform.youwol.com/applications/@youwol/cdn-explorer/latest?package=@youwol/local-youwol-client&tab=doc)

[Package on npm](https://www.npmjs.com/package/@youwol/local-youwol-client)

[Source on GitHub](https://github.com/youwol/local-youwol-client)

# Installation, Build, Test

To install the required dependencies:

```shell
yarn
```

---

To build for development:

```shell
yarn build:dev
```

To build for production:

```shell
yarn build:prod
```

---

Tests require [py-youwol](https://l.youwol.com/doc/py-youwol) to run on port 2001 using the configuration defined [here](https://github.com/youwol/local-youwol-client/blob/main/src/tests/yw_config).

To run tests:

```shell
yarn test
```

Coverage can be evaluated using:

```shell
yarn test-coverage
```

---

To generate code's documentation:

```shell
yarn doc
```
