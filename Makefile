WASM_SRC=target/wasm32-wasip1/debug/playground_jco.wasm

JS_IMPL=\
	log-host.js \
	gas-logger.js \


RS_SRCS=\
	src/bindings.rs\
	src/lib.rs

$(WASM_SRC): $(RS_SRCS)
	cargo component build


# グルーコードの生成
build: $(WASM_SRC)
	jco transpile $(WASM_SRC) \
	-o target/jco \
	--base64-cutoff=99999999 \
	--map 'example:resouceex/example-resource=./example-resouceex.js' \
	--map 'wasi:logging/logging=./log-host.js' \
	--map 'gas:logger/logger=./gas-logger.js' \
	--map 'gas:drive-app/gas-drive-app=./gas-driveapp.js' \
	--map 'gas:drive-app/gas-file=./gas-driveapp-file.js' \
	--map 'gas:drive-app/gas-blob=./gas-driveapp-blob.js' \
	--no-nodejs-compat \
	--tla-compat
	cp js/log-host.js target/jco/
	cp js/example-resouceex.js target/jco/
	cp js/gas-logger.js target/jco/
	cp js/gas-driveapp.js target/jco/
	cp js/gas-driveapp-file.js target/jco/
	cp js/gas-driveapp-blob.js target/jco/

.PHONY: build
