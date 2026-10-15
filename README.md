# Google Apps Script in Rust Example

This is an example project demonstrating how to run Rust (and other Wasm Component languages) on Google Apps Script (GAS), using `jco` and `cargo-component` / `wit-bindgen`. This project was created in August 2025 and is based on the [playground_jco](https://github.com/yoshuawuyts/playground-jco) repository.

## What's This?

Google Apps Script (GAS) uses the V8 runtime. Because of this, it can also execute WebAssembly (Wasm). This means that any language with a Wasm compilation target can run on GAS via Wasm Component Model interfaces (`.wit`).

## Supported Google Apps Script WIT Packages

All WIT definitions are located under `wit/deps/` and paired with strictly-typed TypeScript glue implementations under `js/`:

- `gas:logger` (`js/gas-logger.ts`): `log`, `clear`, `get-log`
- `gas:property` (`js/gas-property-properties.ts`, `js/gas-property-properties-service.ts`): `get-script-properties`, `get-user-properties`, `get-document-properties`, `get-property`, `get-properties`, `get-keys`, `set-property`, `set-properties`, `delete-property`, `delete-all-properties`
- `gas:content-service` (`js/gas-content-service.ts`, `js/gas-content-service-text-output.ts`): `create-text-output`, `append`, `clear`, `download-as-file`, `get-content`, `get-file-name`, `get-mime-type`, `set-content`, `set-mime-type`
- `gas:urlfetchapp` (`js/gas-urlfetchapp.ts`, `js/gas-urlfetchapp-httpresponse.ts`): `fetch`, `fetch-all`, `get-request`, `get-all-headers`, `get-headers`, `get-content`, `get-content-text`, `get-response-code`, `get-blob`, `get-as`
- `gas:drive-app` (`js/gas-driveapp.ts`, `js/gas-driveapp-file.ts`, `js/gas-driveapp-blob.ts`): file/folder CRUD, iterators, search, sharing permissions, and `Blob` manipulation
- `gas:spreadsheet-app` (`js/gas-spreadsheetapp.ts`, `js/gas-spreadsheetapp-spreadsheet.ts`, `js/gas-spreadsheetapp-sheet.ts`, `js/gas-spreadsheetapp-range.ts`): spreadsheet/sheet/range CRUD, `CellValue` variant (`empty`, `string-value`, `number-value`, `boolean-value`, `date-value(s64)` epoch ms), A1 and grid `RangeSelector`, formatting, and sorting
- `gas:utilities` (`js/gas-utilities.ts`): Base64 encode/decode, digests, HMAC/RSA signatures, `format-date`, `format-string`, `get-uuid`, `gzip`/`ungzip`, `zip`/`unzip`, `new-blob`, `parse-csv`, `sleep`
- `gas:html-service` (`js/gas-html-service.ts`, `js/gas-html-service-output.ts`): HTML output creation, templates, metadata, and sandboxing
- `gas:cache-service` (`js/gas-cache-service.ts`, `js/gas-cache-service-cache.ts`): script/user/document cache operations (`get`, `get-all`, `put`, `put-all`, `remove`, `remove-all`)
- `gas:lock-service` (`js/gas-lock-service.ts`, `js/gas-lock-service-lock.ts`): script/user/document concurrency locks (`try-lock`, `wait-lock`, `has-lock`, `release-lock`)
- `gas:session` (`js/gas-session.ts`): active/effective user, locale, script timezone, temporary active user key
- `gas:mail-app` (`js/gas-mail-app.ts`): `send-email` with attachments/HTML options, `get-remaining-daily-quota`
- `gas:gmail-app` (`js/gas-gmail-app.ts`, `js/gas-gmail-types.ts`): thread/message/draft/label management and search
- `gas:calendar-app` (`js/gas-calendar-app.ts`, `js/gas-calendar-types.ts`): calendar & event creation, querying, reminders, and guest status
- `gas:document-app` (`js/gas-document-app.ts`, `js/gas-document-types.ts`): Google Docs creation and editing
- `gas:script-app` (`js/gas-script-app.ts`, `js/gas-script-types.ts`): script metadata, OAuth token, triggers, and authorization state

## WASI Proposals Support on Google Apps Script

All WASI WIT files under `wit/deps/wasi-*` (`wasi-random`, `wasi-clocks`, `wasi-cli`, `wasi-filesystem`, `wasi-sockets`, `wasi-http`, plus `wasi-logging-0.1.0-draft`) follow the official [WebAssembly/WASI](https://github.com/WebAssembly/WASI) proposal definitions verbatim:

- **Implemented on GAS**:
  - `wasi:random/{random, insecure, insecure-seed}` (`js/wasi-random.ts`): CSPRNG random bytes/u64 via `Utilities.getUuid()` + `Utilities.computeDigest(SHA_256)` (`random`), fast PRNG via `Math.random()` (`insecure`), and 128-bit hash seed (`insecure-seed`).
  - `wasi:clocks/{types, system-clock, timezone}` & `wasi:clocks/wall-clock` (`js/wasi-clocks.ts`, `js/wasi-wall-clock.ts`): Current Unix epoch time (`Date.now()`), IANA timezone ID (`Session.getScriptTimeZone()`), and exact UTC offset in nanoseconds at any instant (`Utilities.formatDate(date, tz, "Z")`).
  - `wasi:clocks/monotonic-clock` (`js/wasi-monotonic-clock.ts`): Synchronous monotonic nanosecond clock (`now`, `get-resolution`, `resolution`).
  - `wasi:cli/{environment, exit, terminal-*}` (`js/wasi-cli.ts`): Script Properties exposed as environment variables (`PropertiesService.getScriptProperties().getProperties()`), `get-initial-cwd` returning `none` (`undefined`), `get-terminal-*` returning `none` (`undefined`) per WASI spec, and `exit` / `exit-with-code` halting execution with a descriptive exception.
  - `wasi:cli/{stdout, stderr}` & `wasi:io/streams` (`OutputStream`) (`js/wasi-cli.ts`, `js/wasi-io.ts`): Line-buffered UTF-8 output from Rust `println!` / `eprintln!` routed to `Logger.log` and `console.error`.
  - `wasi:logging/logging` (`js/log-host.ts`): Level-aware logging (`console.debug`, `console.info`, `console.warn`, `console.error`).
- **Explicitly Unimplemented on GAS (`WasiNotImplementedError`)**:
  - Features that cannot be faithfully reproduced in GAS's synchronous, non-POSIX sandbox—such as `wasi:filesystem/*` (POSIX file descriptors/paths), `wasi:sockets/*` (raw TCP/UDP sockets and DNS lookup), `wasi:http/*` (async streaming HTTP bodies/trailers), `wasi:cli/stdin` (interactive standard input), and `wasi:clocks/monotonic-clock.{wait-until, wait-for}` (Component Model 0.3 async waits)—throw an explicit `WasiNotImplementedError` (`[WASI Not Implemented on GAS] <interface>.<method> is not supported in Google Apps Script...`) rather than returning ambiguous dummy values.

### Design Principles for WIT Definitions & TypeScript Glue

1. **Single-Function Overload Representation**: Since WIT does not support function overloading or variable-length arguments, overloaded GAS methods keep their canonical GAS method name as a single WIT function and accept `option<T>`, `record`, or `variant` parameters (e.g., `fetch(url, params: option<url-fetch-request-options>)`, `get-range(selector: range-selector)`, `create-file(input: create-file-input)`).
2. **Strictly-Typed Thin TypeScript Wrappers**: All glue modules in `js/` are written in TypeScript with `@types/google-apps-script` types and discriminated union / record types matching WIT definitions without relying on `any`.

## Building this Project

```bash
# Install cargo-component globally
cargo install cargo-component --locked

# Install JS dependencies
pnpm install

# Compile the project
make build-pack

# Set up your .clasp.json file
# Note: Be sure to add your own scriptId
cat << EOF > .clasp.json
{
  "scriptId": "<your-script-id-here>",
  "rootDir": "dist/"
}
EOF

# Compile in release mode
make BUILD=release build-pack
# Compile the project and push
make BUILD=release push
```

## Project Structure

- `js/`: TypeScript glue wrappers bridging the GAS API and WASI host interfaces with the Wasm Component world.
- `src/`: Rust implementation example
  - `lib.rs`: Implements functions exported in `wit/world.wit`.
  - `args.rs`: Event payload deserialization for `doGet`.
- `wit/`:
  - `deps/`: Official WASI proposal WIT definitions (`wasi-*`) and GAS API WIT package definitions (`google-apps-script-*`)
  - `world.wit`: Component world definition
- `main.ts`: GAS project entry point
- `Makefile`: Build rules

## License

[MIT](./LICENSE)
