WASM_SRC = target/wasm32-wasip1/debug/playground_jco.wasm


JCO_OUT_DIR = \
	    target/jco


JCO_FLAGS = \
	--base64-cutoff=99999999 \
	--no-nodejs-compat \
	--tla-compat

# host impls
JS_SHIMS = \
	js/log-host.js \
	js/example-resouceex.js \
	js/gas-logger.js \
	js/gas-driveapp.js \
	js/gas-driveapp-file.js \
	js/gas-driveapp-blob.js \
	js/gas-property-properties.js \
	js/gas-property-properties-service.js


# guest impls
RS_SRCS = \
	src/bindings.rs\
	src/lib.rs


$(WASM_SRC): $(RS_SRCS)
	cargo component build


# グルーコードの生成
$(JCO_OUT_DIR): $(WASM_SRC) $(JS_SHIMS)
	jco transpile $(WASM_SRC) \
	-o $(JCO_OUT_DIR) \
	$(JCO_FLAGS) \
	--map 'example:resouceex/example-resource=./example-resouceex.js' \
	--map 'wasi:logging/logging=./log-host.js' \
	--map 'gas:logger/logger=./gas-logger.js' \
	--map 'gas:drive-app/gas-drive-app=./gas-driveapp.js' \
	--map 'gas:drive-app/gas-file=./gas-driveapp-file.js' \
	--map 'gas:drive-app/gas-blob=./gas-driveapp-blob.js' \
	--map 'gas:property/properties=./gas-property-properties.js' \
	--map 'gas:property/properties-service=./gas-property-properties-service.js'
	cp $(JS_SHIMS) target/jco/


build-pack: $(JCO_OUT_DIR)
	npx webpack


push: build-pack
	cp ./appsscript.json ./dist
	npx clasp push


.PHONY: build-grue build-pack push
