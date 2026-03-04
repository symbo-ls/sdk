# SDK Integration Tests

The SDK integration tests are written using [tape](https://github.com/tape-testing/tape). They currently run against the development environment, and are triggered in CI when a pull request is opened. As tape is a unit testing framework, the functionality is purposely simple. Anything that is not supported out-of-the-box can be written using JavaScript.

## Dependencies

- [node v20.x.x](https://nodejs.org/en/blog/release/v20.9.0)
- npm v9.x.x(installed with node)

### Recommended Plugins and Modules

- [nvm](https://github.com/nvm-sh/nvm)
- eslint
- GitHub Copilot
- Prettier-Standard - JavaScript formatter
- StandardJS - JavaScript Standard Style
- mardownlint

## Testing

### Architecture

`tape` is a fairly simplistic framework. As such, the current solution to allow creation of globals requires running a file that instantiates them before execution of any test that depends on them. Please take time to review `index.js`, and the existing test execution commands in the `package.json`.

Reusable functions are located in `base.js`. Review these and leverage them as appropriate. Any reusable functions can be added here. If new global values are needed, add them to the index file, and ensure they are properly notated in the eslint config at repository root.

### Setup to Run Against Dev

- Ensure you are in the root directory for the SDK.
- Copy the `deploy.npmrc` file at repository root and re-name `.npmrc`.
- Run `npm login`
- Run `npm install`
- Add `.env` to the root of SDK with for secrets. File content should look like:

```.env
GUEST_PASSWORD=password123
```

To use a different account for testing add the following flag to the `.env`:

```.env
LOCAL_TEST_ENV=true
LOCAL_EMAIL='someUserName@symbols.app'
LOCAL_PASSWORD='somePassword123'
```

Due to the inability to register a new user, a hardcoded user is needed for a majority of the tests.
Contact the SDET team for creds.

### Test Execution

To run the all tests simply type `npm run test:all`.
To run a single test use `npm run test:specific --testname=name-of-test`

### Environments
Multiple environments are present in which the tests may be run:
- `development`
- `testing`
- `staging`
- `production`

Currently, smoke tests run after every deployment to one of these environments. When executed locally, the SDK automation is run by default in the `testing` environment.

### Conditional Logic for Test Execution in the Environments
base.js contains helper tools to interrogate the current environment:
- `base.isDevelopment()`
- `base.isTesting()`
- `base.isStaging()`
- `base.isProduction()`

If a test should not run on a specific environment, (such as Production), simply wrap the test in a conditional clause:

```
if(base.isProduction()) {
   test.skip()
 } else(
   test('some test does some thing')
 )
 ```

#### Debug

If having trouble with the SDK and need more info you can can `getSdkStatus()` from the `base.js` file.

## Conventions to Follow

Use git naming convention when creating branches. For test changes should be `test/test-or-change-name`.

For commits, preface them with `test: commit description`. That way we can clearly distinguish commits for testing from development commits made in the repo, and ensure version incrementation for the SDK is meaningful.

Linting errors should show up when rules are violated. As we are writing integration tests in the development repo, we need to adhere to the rules put in place, and ensure there are no linting errors before opening pull requests.
