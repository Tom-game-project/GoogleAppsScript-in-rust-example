WASM_SRC=target/wasm32-wasip1/debug/playground_jco.wasm

$(WASM_SRC):
	cargo component build

build: $(WASM_SRC)
	jco transpile $(WASM_SRC) \
	-o target/jco \
	--base64-cutoff=99999999 \
	--no-nodejs-compat

.PHONY: build
