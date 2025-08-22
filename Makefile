WASM_SRC=target/wasm32-wasip1/debug/playground_jco.wasm

$(WASM_SRC):
	cargo component build

# グルーコードの生成
build: $(WASM_SRC)
	jco transpile $(WASM_SRC) \
	-o target/jco \
	--base64-cutoff=99999999 \
	--map 'wasi:logging/logging=./log-host.js' \
	--no-nodejs-compat \
	--tla-compat
	cp log-host.js ./target/jco/

.PHONY: build
