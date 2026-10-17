BUILD ?= release

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

DIST_HTML := dist/index.html

GLEAM_SRCS := \
	web/gleam.toml \
	web/index.html \
	web/src/gas_git_ui.gleam \
	web/src/gas_git_ui/page.gleam \
	web/src/gas_git_ui/types.gleam \
	web/src/gas_git_ui/api.gleam \
	web/src/gas_git_ui/gas_git_ffi.mjs \
	web/src/gas_git_ui/components/header.gleam \
	web/src/gas_git_ui/components/repo_form.gleam \
	web/src/gas_git_ui/graph.gleam \
	web/src/gas_git_ui/components/repo_list.gleam \
	web/src/gas_git_ui/components/quick_setup.gleam \
	web/src/gas_git_ui/components/commit_view.gleam

# host impls
JS_SHIMS = \
	js/wasi-random.ts \
	js/wasi-clocks.ts \
	js/wasi-wall-clock.ts \
	js/wasi-monotonic-clock.ts \
	js/wasi-io.ts \
	js/wasi-cli.ts \
	js/wasi-filesystem.ts \
	js/wasi-sockets.ts \
	js/wasi-http.ts \
	js/wasi_stub.ts \
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
	js/gas-math.ts

# guest impls
RS_SRCS = \
	src/lib.rs \
	src/args.rs \
	src/git_server.rs \
	wit/world.wit

# Gleam + Lustre のビルドおよび単一ファイル dist/index.html へのバンドル
$(DIST_HTML): $(GLEAM_SRCS) tools/bundle_web_html.mjs
	@if command -v gleam >/dev/null 2>&1; then \
		echo "Building Gleam + Lustre Web UI (target=javascript)..."; \
		cd web && gleam build --target javascript; \
	else \
		echo "gleam CLI not found; bundling with fallback runtime"; \
	fi
	node ./tools/bundle_web_html.mjs

build-ui: $(DIST_HTML)

$(WASM_SRC): $(RS_SRCS) $(DIST_HTML)
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
	--map 'wasi:random/random@0.2.0=./wasi-random.ts' \
	--map 'wasi:random/random@0.3.2=./wasi-random.ts' \
	--map 'wasi:random/insecure=./wasi-random.ts' \
	--map 'wasi:random/insecure@0.2.0=./wasi-random.ts' \
	--map 'wasi:random/insecure@0.3.2=./wasi-random.ts' \
	--map 'wasi:random/insecure-seed=./wasi-random.ts' \
	--map 'wasi:random/insecure-seed@0.2.0=./wasi-random.ts' \
	--map 'wasi:random/insecure-seed@0.3.2=./wasi-random.ts' \
	--map 'wasi:clocks/types=./wasi-clocks.ts' \
	--map 'wasi:clocks/types@0.3.2=./wasi-clocks.ts' \
	--map 'wasi:clocks/system-clock=./wasi-clocks.ts' \
	--map 'wasi:clocks/system-clock@0.3.2=./wasi-clocks.ts' \
	--map 'wasi:clocks/timezone=./wasi-clocks.ts' \
	--map 'wasi:clocks/timezone@0.3.2=./wasi-clocks.ts' \
	--map 'wasi:clocks/wall-clock=./wasi-wall-clock.ts' \
	--map 'wasi:clocks/wall-clock@0.2.0=./wasi-wall-clock.ts' \
	--map 'wasi:clocks/monotonic-clock=./wasi-monotonic-clock.ts' \
	--map 'wasi:clocks/monotonic-clock@0.2.0=./wasi-monotonic-clock.ts' \
	--map 'wasi:clocks/monotonic-clock@0.3.2=./wasi-monotonic-clock.ts' \
	--map 'wasi:cli/environment=./wasi-cli.ts' \
	--map 'wasi:cli/environment@0.2.0=./wasi-cli.ts' \
	--map 'wasi:cli/environment@0.3.2=./wasi-cli.ts' \
	--map 'wasi:cli/exit=./wasi-cli.ts' \
	--map 'wasi:cli/exit@0.2.0=./wasi-cli.ts' \
	--map 'wasi:cli/exit@0.3.2=./wasi-cli.ts' \
	--map 'wasi:cli/stdin=./wasi-cli.ts' \
	--map 'wasi:cli/stdin@0.2.0=./wasi-cli.ts' \
	--map 'wasi:cli/stdin@0.3.2=./wasi-cli.ts' \
	--map 'wasi:cli/stdout=./wasi-cli.ts' \
	--map 'wasi:cli/stdout@0.2.0=./wasi-cli.ts' \
	--map 'wasi:cli/stdout@0.3.2=./wasi-cli.ts' \
	--map 'wasi:cli/stderr=./wasi-cli.ts' \
	--map 'wasi:cli/stderr@0.2.0=./wasi-cli.ts' \
	--map 'wasi:cli/stderr@0.3.2=./wasi-cli.ts' \
	--map 'wasi:cli/terminal-input=./wasi-cli.ts' \
	--map 'wasi:cli/terminal-input@0.2.0=./wasi-cli.ts' \
	--map 'wasi:cli/terminal-input@0.3.2=./wasi-cli.ts' \
	--map 'wasi:cli/terminal-output=./wasi-cli.ts' \
	--map 'wasi:cli/terminal-output@0.2.0=./wasi-cli.ts' \
	--map 'wasi:cli/terminal-output@0.3.2=./wasi-cli.ts' \
	--map 'wasi:cli/terminal-stdin=./wasi-cli.ts' \
	--map 'wasi:cli/terminal-stdin@0.2.0=./wasi-cli.ts' \
	--map 'wasi:cli/terminal-stdin@0.3.2=./wasi-cli.ts' \
	--map 'wasi:cli/terminal-stdout=./wasi-cli.ts' \
	--map 'wasi:cli/terminal-stdout@0.2.0=./wasi-cli.ts' \
	--map 'wasi:cli/terminal-stdout@0.3.2=./wasi-cli.ts' \
	--map 'wasi:cli/terminal-stderr=./wasi-cli.ts' \
	--map 'wasi:cli/terminal-stderr@0.2.0=./wasi-cli.ts' \
	--map 'wasi:cli/terminal-stderr@0.3.2=./wasi-cli.ts' \
	--map 'wasi:io/streams=./wasi-io.ts' \
	--map 'wasi:io/streams@0.2.0=./wasi-io.ts' \
	--map 'wasi:io/poll=./wasi-io.ts' \
	--map 'wasi:io/poll@0.2.0=./wasi-io.ts' \
	--map 'wasi:io/error=./wasi-io.ts' \
	--map 'wasi:io/error@0.2.0=./wasi-io.ts' \
	--map 'wasi:filesystem/types=./wasi-filesystem.ts' \
	--map 'wasi:filesystem/types@0.2.0=./wasi-filesystem.ts' \
	--map 'wasi:filesystem/types@0.3.2=./wasi-filesystem.ts' \
	--map 'wasi:filesystem/preopens=./wasi-filesystem.ts' \
	--map 'wasi:filesystem/preopens@0.2.0=./wasi-filesystem.ts' \
	--map 'wasi:filesystem/preopens@0.3.2=./wasi-filesystem.ts' \
	--map 'wasi:sockets/types=./wasi-sockets.ts' \
	--map 'wasi:sockets/types@0.2.0=./wasi-sockets.ts' \
	--map 'wasi:sockets/types@0.3.2=./wasi-sockets.ts' \
	--map 'wasi:sockets/ip-name-lookup=./wasi-sockets.ts' \
	--map 'wasi:sockets/ip-name-lookup@0.2.0=./wasi-sockets.ts' \
	--map 'wasi:sockets/ip-name-lookup@0.3.2=./wasi-sockets.ts' \
	--map 'wasi:http/types=./wasi-http.ts' \
	--map 'wasi:http/types@0.2.0=./wasi-http.ts' \
	--map 'wasi:http/types@0.3.2=./wasi-http.ts' \
	--map 'wasi:http/client=./wasi-http.ts' \
	--map 'wasi:http/client@0.3.2=./wasi-http.ts' \
	--map 'wasi:http/handler=./wasi-http.ts' \
	--map 'wasi:http/handler@0.3.2=./wasi-http.ts' \
	--map 'wasi:http/outgoing-handler=./wasi-http.ts' \
	--map 'wasi:http/outgoing-handler@0.2.0=./wasi-http.ts'
	cp $(JS_SHIMS) $(JCO_OUT_DIR)
	echo "success to jco transpile"

# packing (dist/main.js + dist/index.html)
build-pack: $(JCO_OUT_DIR) $(DIST_HTML)
	echo $(WASM_SRC)
	pnpm exec webpack --progress
	node ./tools/bundle_web_html.mjs

push: build-pack
	cp ./appsscript.json ./dist
	pnpm exec clasp push

install-git-remote-gas:
	mkdir -p $(HOME)/.local/bin
	cp ./tools/git-remote-gas $(HOME)/.local/bin/git-remote-gas
	chmod +x $(HOME)/.local/bin/git-remote-gas
	@echo "Installed git-remote-gas to $(HOME)/.local/bin/git-remote-gas"

test-git-e2e: $(DIST_HTML)
	python3 ./tools/test_gas_git_e2e.py

.PHONY: build-ui build-pack push install-git-remote-gas test-git-e2e
