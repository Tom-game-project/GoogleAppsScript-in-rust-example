# Google Apps Script in Rust Example

This is an example project demonstrating how to run Rust on Google Apps Script (GAS), using jco and cargo-component. This project was created in February 2025 and is based on the [playground_jco](https://github.com/yoshuawuyts/playground-jco) repository.

## What's This?

Google Apps Script (GAS) uses the V8 runtime. Because of this, it can also execute WebAssembly (Wasm). This means that any language with a Wasm compilation target can (in theory) also run on GAS.

## Building this Project

```
# You need to install cargo-component globally
cargo install cargo-component --locked

# Install JS dependencies
npm install

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

# Compile the project and push 
make push
```

## Using the Google Apps Script API via WIT

API definitions for the Google Apps Script API are located in the `wit` directory. If you can't find the API you need, you can add your own .wit file definitions to this directory.

## Contribute

Contributions are welcome! Please feel free to open an issue or submit a pull request.

## Other Languages

This project is an example using Rust. However, jco supports other languages. Please see the jco repository for more information on language compatibility.

## License

MIT
