WASM_SRC=target/wasm32-wasip1/debug/playground_jco.wasm

JS_IMPL=\
	log-host.js \
	gas-logger.js \


$(WASM_SRC):
	cargo component build


# グルーコードの生成
build: $(WASM_SRC)
	jco transpile $(WASM_SRC) \
	-o target/jco \
	--base64-cutoff=99999999 \
	--map 'wasi:logging/logging=./log-host.js' \
	--map 'gas:logger/logger=./gas-logger.js' \
	--map 'example:resouceex/example-resource=./example-resouceex.js' \
	--no-nodejs-compat \
	--tla-compat
	cp js/log-host.js target/jco/
	cp js/gas-logger.js target/jco/
	cp js/example-resouceex.js target/jco/

.PHONY: build
