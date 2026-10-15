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
	js/wasi-random.ts \
	js/log-host.ts \
	js/example-resouceex.ts \
	js/gas-logger.ts \
	js/gas-driveapp.ts \
	js/gas-driveapp-file.ts \
	js/gas-driveapp-blob.ts \
	js/gas-property-properties.ts \
	js/gas-property-properties-service.ts \
	js/gas-spreadsheetapp.ts \
	js/gas-spreadsheetapp-range.ts \
	js/gas-spreadsheetapp-sheet.ts \
	js/gas-spreadsheetapp-spreadsheet.ts \
	js/gas-content-service.ts \
	js/gas-content-service-text-output.ts \
	js/gas-urlfetchapp.ts \
	js/gas-urlfetchapp-httpresponse.ts \
	js/gas-utilities.ts \
	js/gas-html-service.ts \
	js/gas-html-service-output.ts \
	js/gas-cache-service.ts \
	js/gas-cache-service-cache.ts \
	js/gas-lock-service.ts \
	js/gas-lock-service-lock.ts \
	js/gas-session.ts \
	js/gas-mail-app.ts \
	js/gas-gmail-app.ts \
	js/gas-gmail-types.ts \
	js/gas-calendar-app.ts \
	js/gas-calendar-types.ts \
	js/gas-document-app.ts \
	js/gas-document-types.ts \
	js/gas-script-app.ts \
	js/gas-script-types.ts \
	js/gas-math.ts \
	js/wasi_stub.ts

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
	--map 'example:resouceex/example-resource=./example-resouceex.ts' \
	--map 'gas:logger/logger=./gas-logger.ts' \
	--map 'gas:drive-app/gas-drive-app=./gas-driveapp.ts' \
	--map 'gas:drive-app/gas-file=./gas-driveapp-file.ts' \
	--map 'gas:drive-app/gas-access=./gas-driveapp-file.ts' \
	--map 'gas:drive-app/gas-blob=./gas-driveapp-blob.ts' \
	--map 'gas:property/properties=./gas-property-properties.ts' \
	--map 'gas:property/properties-service=./gas-property-properties-service.ts' \
	--map 'gas:spreadsheet-app/gas-spreadsheet-app=./gas-spreadsheetapp.ts' \
	--map 'gas:spreadsheet-app/gas-spreadsheet=./gas-spreadsheetapp-spreadsheet.ts' \
	--map 'gas:spreadsheet-app/gas-range=./gas-spreadsheetapp-range.ts' \
	--map 'gas:spreadsheet-app/gas-sheet=./gas-spreadsheetapp-sheet.ts' \
	--map 'gas:content-service/gas-content-service=./gas-content-service.ts' \
	--map 'gas:content-service/gas-text-output=./gas-content-service-text-output.ts' \
	--map 'gas:urlfetchapp/gas-url-fetch-app=./gas-urlfetchapp.ts' \
	--map 'gas:urlfetchapp/gas-http-response=./gas-urlfetchapp-httpresponse.ts' \
	--map 'gas:utilities/gas-utilities=./gas-utilities.ts' \
	--map 'gas:html-service/gas-html-service=./gas-html-service.ts' \
	--map 'gas:html-service/gas-html-output=./gas-html-service-output.ts' \
	--map 'gas:cache-service/gas-cache-service=./gas-cache-service.ts' \
	--map 'gas:cache-service/gas-cache=./gas-cache-service-cache.ts' \
	--map 'gas:lock-service/gas-lock-service=./gas-lock-service.ts' \
	--map 'gas:lock-service/gas-lock=./gas-lock-service-lock.ts' \
	--map 'gas:session/gas-session=./gas-session.ts' \
	--map 'gas:mail-app/gas-mail-app=./gas-mail-app.ts' \
	--map 'gas:gmail-app/gas-gmail-app=./gas-gmail-app.ts' \
	--map 'gas:gmail-app/gas-gmail-types=./gas-gmail-types.ts' \
	--map 'gas:calendar-app/gas-calendar-app=./gas-calendar-app.ts' \
	--map 'gas:calendar-app/gas-calendar-types=./gas-calendar-types.ts' \
	--map 'gas:document-app/gas-document-app=./gas-document-app.ts' \
	--map 'gas:document-app/gas-document-types=./gas-document-types.ts' \
	--map 'gas:script-app/gas-script-app=./gas-script-app.ts' \
	--map 'gas:script-app/gas-script-types=./gas-script-types.ts' \
	--map 'gas:math/gas-math=./gas-math.ts' \
	--map 'wasi:logging/logging=./log-host.ts' \
	--map 'wasi:random/random=./wasi-random.ts' \
	--map 'wasi:io/poll=./wasi_stub.ts' \
	--map 'wasi:io/poll@0.2.0=./wasi_stub.ts'
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
