# Google Apps Script in Rust Example

This is an example project demonstrating how to run Rust (and other Wasm Component languages) on Google Apps Script (GAS), using `jco` and `cargo-component` / `wit-bindgen`. This project was created in August 2025 and is based on the [playground_jco](https://github.com/yoshuawuyts/playground-jco) repository.

## What's This?

Google Apps Script (GAS) uses the V8 runtime. Because of this, it can also execute WebAssembly (Wasm). This means that any language with a Wasm compilation target can run on GAS via Wasm Component Model interfaces (`.wit`).

## Supported Google Apps Script WIT Packages

All WIT definitions are located under `wit/deps/` and paired with thin JavaScript/TypeScript glue implementations under `js/`:

- `gas:logger` (`Logger`): `log`, `clear`, `get-log`
- `gas:property` (`PropertiesService`, `Properties`): `get-script-properties`, `get-user-properties`, `get-document-properties`, `get-property`, `get-properties`, `get-keys`, `set-property`, `set-properties`, `delete-property`, `delete-all-properties`
- `gas:content-service` (`ContentService`, `TextOutput`, `MimeType`): `create-text-output`, `append`, `clear`, `download-as-file`, `get-content`, `get-file-name`, `get-mime-type`, `set-content`, `set-mime-type`
- `gas:urlfetchapp` (`UrlFetchApp`, `HTTPResponse`): `fetch`, `fetch-all`, `get-request`, `get-all-headers`, `get-headers`, `get-content`, `get-content-text`, `get-response-code`, `get-blob`, `get-as`
- `gas:drive-app` (`DriveApp`, `File`, `Folder`, `FileIterator`, `FolderIterator`, `Blob`, `User`, `Access`, `Permission`): file/folder CRUD, iterators, search, sharing permissions, and `Blob` manipulation
- `gas:spreadsheet-app` (`SpreadsheetApp`, `Spreadsheet`, `Sheet`, `Range`): spreadsheet/sheet/range CRUD, `CellValue` variant (`empty`, `string-value`, `number-value`, `boolean-value`, `date-value(s64)` epoch ms), A1 and grid `RangeSelector`, formatting, and sorting
- `gas:utilities` (`Utilities`, `Charset`, `DigestAlgorithm`, `MacAlgorithm`, `RsaAlgorithm`): Base64 encode/decode, digests, HMAC/RSA signatures, `format-date`, `format-string`, `get-uuid`, `gzip`/`ungzip`, `zip`/`unzip`, `new-blob`, `parse-csv`, `sleep`
- `gas:html-service` (`HtmlService`, `HtmlOutput`, `HtmlTemplate`, `HtmlOutputMetaTag`, `SandboxMode`, `XFrameOptionsMode`): HTML output creation, templates, metadata, and sandboxing
- `gas:cache-service` (`CacheService`, `Cache`): script/user/document cache operations (`get`, `get-all`, `put`, `put-all`, `remove`, `remove-all`)
- `gas:lock-service` (`LockService`, `Lock`): script/user/document concurrency locks (`try-lock`, `wait-lock`, `has-lock`, `release-lock`)
- `gas:session` (`Session`): active/effective user, locale, script timezone, temporary active user key
- `gas:mail-app` (`MailApp`): `send-email` with attachments/HTML options, `get-remaining-daily-quota`
- `gas:gmail-app` (`GmailApp`, `GmailThread`, `GmailMessage`, `GmailDraft`, `GmailLabel`): thread/message/draft/label management and search
- `gas:calendar-app` (`CalendarApp`, `Calendar`, `CalendarEvent`, `EventGuest`): calendar & event creation, querying, reminders, and guest status
- `gas:document-app` (`DocumentApp`, `Document`, `Body`, `Paragraph`, `Table`, `TableRow`, `TableCell`, `Text`): Google Docs creation and editing
- `gas:script-app` (`ScriptApp`, `Trigger`, `AuthorizationInfo`): script metadata, OAuth token, triggers, and authorization state

### Design Principles for WIT Definitions

1. **Single-Function Overload Representation**: Since WIT does not support function overloading or variable-length arguments, overloaded GAS methods keep their canonical GAS method name as a single WIT function and accept `option<T>`, `record`, or `variant` parameters (e.g., `fetch(url, params: option<url-fetch-request-options>)`, `get-range(selector: range-selector)`, `create-file(input: create-file-input)`).
2. **Thin Wrapper & Faithful GAS Data Types**: Objects returned by GAS APIs are wrapped thinly in JS classes (`GasFile`, `GasSpreadsheet`, `GasSheet`, `GasRange`, `GasBlob`, etc.), dates are passed as `s64` Unix epoch milliseconds (`Date.getTime()`), and key-value maps are represented as `list<tuple<string, string>>`.

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

- `js/`: JavaScript/TypeScript glue wrappers bridging the GAS API with the Wasm Component world.
- `src/`: Rust implementation example
  - `lib.rs`: Implements functions exported in `wit/world.wit`.
  - `args.rs`: Event payload deserialization for `doGet`.
- `wit/`:
  - `deps/`: GAS API WIT package definitions
  - `world.wit`: Component world definition
- `main.ts`: GAS project entry point
- `Makefile`: Build rules

## License

[MIT](./LICENSE)
