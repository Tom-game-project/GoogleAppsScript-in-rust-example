BUILD ?= debug

ifeq ($(BUILD), release)
    WASM_SRC := target/wasm32-wasip2/release/GoogleAppsScript_in_rust_example.wasm
    CARGO_FLAGS := --target wasm32-wasip2 --release
else
    WASM_SRC := target/wasm32-wasip2/debug/GoogleAppsScript_in_rust_example.wasm
    CARGO_FLAGS := --target wasm32-wasip2
endif

JCO_OUT_DIR = \
	target/jco

JCO_FLAGS = \
	--base64-cutoff=99999999 \
	--no-nodejs-compat \
	--tla-compat

# host impls
JS_SHIMS = \
	js/wasi-random.js \
	js/log-host.js \
	js/example-resouceex.js \
	js/gas-logger.js \
	js/gas-driveapp.js \
	js/gas-driveapp-file.js \
	js/gas-driveapp-blob.js \
	js/gas-property-properties.js \
	js/gas-property-properties-service.js \
	js/gas-spreadsheetapp.js \
	js/gas-spreadsheetapp-range.js \
	js/gas-spreadsheetapp-sheet.js \
	js/gas-spreadsheetapp-spreadsheet.js \
	js/gas-content-service.ts \
	js/gas-content-service-text-output.ts \
	js/gas-urlfetchapp.js \
	js/gas-urlfetchapp-httpresponse.js \
	js/gas-utilities.js \
	js/gas-html-service.js \
	js/gas-html-service-output.js \
	js/gas-cache-service.js \
	js/gas-cache-service-cache.js \
	js/gas-lock-service.js \
	js/gas-lock-service-lock.js \
	js/gas-session.js \
	js/gas-mail-app.js \
	js/gas-gmail-app.js \
	js/gas-gmail-types.js \
	js/gas-calendar-app.js \
	js/gas-calendar-types.js \
	js/gas-document-app.js \
	js/gas-document-types.js \
	js/gas-script-app.js \
	js/gas-script-types.js \
	js/gas-math.js \
	js/wasi_stub.js

# guest impls
RS_SRCS = \
	src/lib.rs \
	src/args.rs

$(WASM_SRC): $(RS_SRCS)
	cargo build $(CARGO_FLAGS)

# グルーコードの生成
$(JCO_OUT_DIR): $(WASM_SRC) $(JS_SHIMS)
	pnpm exec jco transpile $(WASM_SRC) \
	-o $(JCO_OUT_DIR) \
	$(JCO_FLAGS) \
	--map 'example:resouceex/example-resource=./example-resouceex.js' \
	--map 'gas:logger/logger=./gas-logger.js' \
	--map 'gas:drive-app/gas-drive-app=./gas-driveapp.js' \
	--map 'gas:drive-app/gas-file=./gas-driveapp-file.js' \
	--map 'gas:drive-app/gas-access=./gas-driveapp-file.js' \
	--map 'gas:drive-app/gas-blob=./gas-driveapp-blob.js' \
	--map 'gas:property/properties=./gas-property-properties.js' \
	--map 'gas:property/properties-service=./gas-property-properties-service.js' \
	--map 'gas:spreadsheet-app/gas-spreadsheet-app=./gas-spreadsheetapp.js' \
	--map 'gas:spreadsheet-app/gas-spreadsheet=./gas-spreadsheetapp-spreadsheet.js' \
	--map 'gas:spreadsheet-app/gas-range=./gas-spreadsheetapp-range.js' \
	--map 'gas:spreadsheet-app/gas-sheet=./gas-spreadsheetapp-sheet.js' \
	--map 'gas:content-service/gas-content-service=./gas-content-service.ts' \
	--map 'gas:content-service/gas-text-output=./gas-content-service-text-output.ts' \
	--map 'gas:urlfetchapp/gas-url-fetch-app=./gas-urlfetchapp.js' \
	--map 'gas:urlfetchapp/gas-http-response=./gas-urlfetchapp-httpresponse.js' \
	--map 'gas:utilities/gas-utilities=./gas-utilities.js' \
	--map 'gas:html-service/gas-html-service=./gas-html-service.js' \
	--map 'gas:html-service/gas-html-output=./gas-html-service-output.js' \
	--map 'gas:cache-service/gas-cache-service=./gas-cache-service.js' \
	--map 'gas:cache-service/gas-cache=./gas-cache-service-cache.js' \
	--map 'gas:lock-service/gas-lock-service=./gas-lock-service.js' \
	--map 'gas:lock-service/gas-lock=./gas-lock-service-lock.js' \
	--map 'gas:session/gas-session=./gas-session.js' \
	--map 'gas:mail-app/gas-mail-app=./gas-mail-app.js' \
	--map 'gas:gmail-app/gas-gmail-app=./gas-gmail-app.js' \
	--map 'gas:gmail-app/gas-gmail-types=./gas-gmail-types.js' \
	--map 'gas:calendar-app/gas-calendar-app=./gas-calendar-app.js' \
	--map 'gas:calendar-app/gas-calendar-types=./gas-calendar-types.js' \
	--map 'gas:document-app/gas-document-app=./gas-document-app.js' \
	--map 'gas:document-app/gas-document-types=./gas-document-types.js' \
	--map 'gas:script-app/gas-script-app=./gas-script-app.js' \
	--map 'gas:script-app/gas-script-types=./gas-script-types.js' \
	--map 'gas:math/gas-math=./gas-math.js' \
	--map 'wasi:logging/logging=./log-host.js' \
	--map 'wasi:random/random=./wasi-random.js' \
	--map 'wasi:io/poll=./wasi_stub.js' \
	--map 'wasi:io/poll@0.2.0=./wasi_stub.js'
	cp $(JS_SHIMS) $(JCO_OUT_DIR)
	echo "success to jco transpile"

# packing
build-pack: $(JCO_OUT_DIR)
	echo $(WASM_SRC)
	pnpm exec webpack --progress

push: build-pack
	cp ./appsscript.json ./dist
	pnpm exec clasp push

.PHONY: build-pack push
