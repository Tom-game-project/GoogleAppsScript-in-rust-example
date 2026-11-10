# =============================================================================
# GAS Git Server build
#
#   make            -> build-pack (dist/main.js + dist/index.html + dist/appsscript.json)
#   make push       -> build-pack + clasp push
#   make check      -> cargo test + TypeScript type check
#   make BUILD=debug ...   fast unoptimized Rust build for local iteration
#
# Every target below is a real file whose prerequisites are listed explicitly
# (no wildcards), so a second `make` with no source changes does nothing.
#
# Dependency graph (independent branches run in parallel; see MAKEFLAGS):
#
#   Gleam sources ──► dist/index.html ─────────────────────────────┐
#   Rust + WIT ──► *.wasm ──► target/jco/*.js ─┬─► dist/main.js ───┼─► build-pack
#                                              └─► typecheck stamp ┤
#   appsscript.json ──► dist/appsscript.json ──────────────────────┘
#
# dist/index.html is NOT embedded into the Wasm binary: it is pushed by clasp as the
# GAS HTML file "index" and read at runtime (HtmlService.createHtmlOutputFromFile).
# =============================================================================

SHELL := /bin/bash
.DEFAULT_GOAL := build-pack
.DELETE_ON_ERROR:
.SUFFIXES:

MAKEFLAGS += --no-builtin-rules
# Parallel by default on GNU make >= 4 (cargo and gleam/webpack branches are independent).
# Override with `make -j1` or `make NPROC=1`.
ifneq ($(filter output-sync,$(.FEATURES)),)
NPROC ?= $(shell nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)
MAKEFLAGS += --jobs=$(NPROC) --output-sync=target
endif

BUILD ?= release

CRATE_FILE_NAME := GoogleAppsScript_in_rust_example
ifeq ($(BUILD), release)
    WASM_SRC := target/wasm32-wasip2/release/$(CRATE_FILE_NAME).wasm
    CARGO_FLAGS := --target wasm32-wasip2 --release --locked
else
    WASM_SRC := target/wasm32-wasip2/debug/$(CRATE_FILE_NAME).wasm
    CARGO_FLAGS := --target wasm32-wasip2 --locked
endif

JCO_OUT_DIR := target/jco
JCO_JS := $(JCO_OUT_DIR)/$(CRATE_FILE_NAME).js
# Host shims are imported straight from js/ (relative to $(JCO_OUT_DIR)), so they are
# no longer copied into target/jco on every build.
JCO_SHIM_DIR := ../../js

JCO_FLAGS = \
	--base64-cutoff=99999999 \
	--no-nodejs-compat \
	--tla-compat

DIST_HTML := dist/index.html
DIST_JS := dist/main.js
DIST_MANIFEST := dist/appsscript.json
TYPECHECK_STAMP := target/.typecheck.stamp

# ---------------------------------------------------------------------------
# Source lists (explicit; keep in sync with `git ls-files`)
# ---------------------------------------------------------------------------

GLEAM_SRCS := \
	web/gleam.toml \
	web/manifest.toml \
	web/index.html \
	web/src/gas_git_ui.gleam \
	web/src/gas_git_ui/api.gleam \
	web/src/gas_git_ui/gas_git_ffi.mjs \
	web/src/gas_git_ui/graph.gleam \
	web/src/gas_git_ui/page.gleam \
	web/src/gas_git_ui/types.gleam \
	web/src/gas_git_ui/components/commit_view.gleam \
	web/src/gas_git_ui/components/header.gleam \
	web/src/gas_git_ui/components/quick_setup.gleam \
	web/src/gas_git_ui/components/repo_form.gleam \
	web/src/gas_git_ui/components/repo_list.gleam

UI_BUNDLER := tools/bundle_web_html.mjs

# Host (JS) implementations of the imported WIT interfaces
JS_SHIMS := \
	js/example-resouceex.ts \
	js/gas-cache-service-cache.ts \
	js/gas-cache-service.ts \
	js/gas-calendar-app.ts \
	js/gas-calendar-types.ts \
	js/gas-content-service-text-output.ts \
	js/gas-content-service.ts \
	js/gas-document-app.ts \
	js/gas-document-types.ts \
	js/gas-driveapp-blob.ts \
	js/gas-driveapp-file.ts \
	js/gas-driveapp.ts \
	js/gas-gmail-app.ts \
	js/gas-gmail-types.ts \
	js/gas-html-service-output.ts \
	js/gas-html-service.ts \
	js/gas-lock-service-lock.ts \
	js/gas-lock-service.ts \
	js/gas-logger.ts \
	js/gas-mail-app.ts \
	js/gas-math.ts \
	js/gas-property-properties-service.ts \
	js/gas-property-properties.ts \
	js/gas-script-app.ts \
	js/gas-script-types.ts \
	js/gas-session.ts \
	js/gas-spreadsheetapp-range.ts \
	js/gas-spreadsheetapp-sheet.ts \
	js/gas-spreadsheetapp-spreadsheet.ts \
	js/gas-spreadsheetapp.ts \
	js/gas-urlfetchapp-httpresponse.ts \
	js/gas-urlfetchapp.ts \
	js/gas-utilities.ts \
	js/log-host.ts \
	js/wasi-cli.ts \
	js/wasi-clocks.ts \
	js/wasi-filesystem.ts \
	js/wasi-http.ts \
	js/wasi-io.ts \
	js/wasi-monotonic-clock.ts \
	js/wasi-random.ts \
	js/wasi-sockets.ts \
	js/wasi_stub.ts \
	js/wasi-wall-clock.ts

WIT_SRCS := \
	wit/world.wit \
	wit/deps/google-apps-script-cacheservice-0.1.0-alpha/package.wit \
	wit/deps/google-apps-script-calendarapp-0.1.0-alpha/package.wit \
	wit/deps/google-apps-script-contentservice-0.1.0-alpha/package.wit \
	wit/deps/google-apps-script-documentapp-0.1.0-alpha/package.wit \
	wit/deps/google-apps-script-driveapp-0.1.0-alpha/package.wit \
	wit/deps/google-apps-script-gmailapp-0.1.0-alpha/package.wit \
	wit/deps/google-apps-script-htmlservice-0.1.0-alpha/package.wit \
	wit/deps/google-apps-script-lockservice-0.1.0-alpha/package.wit \
	wit/deps/google-apps-script-logger-0.1.0-alpha/package.wit \
	wit/deps/google-apps-script-mailapp-0.1.0-alpha/package.wit \
	wit/deps/google-apps-script-property-0.1.0-alpha/package.wit \
	wit/deps/google-apps-script-scriptapp-0.1.0-alpha/package.wit \
	wit/deps/google-apps-script-session-0.1.0-alpha/package.wit \
	wit/deps/google-apps-script-spreadsheetapp-0.1.0-alpha/package.wit \
	wit/deps/google-apps-script-urlfetchapp-0.1.0-alpha/package.wit \
	wit/deps/google-apps-script-utilities-0.1.0-alpha/package.wit \
	wit/deps/math-0.1.0-alpha/package.wit \
	wit/deps/resource-example/package.wit \
	wit/deps/wasi-cli/command.wit \
	wit/deps/wasi-cli/environment.wit \
	wit/deps/wasi-cli/exit.wit \
	wit/deps/wasi-cli/imports.wit \
	wit/deps/wasi-cli/run.wit \
	wit/deps/wasi-cli/stdio.wit \
	wit/deps/wasi-cli/terminal.wit \
	wit/deps/wasi-clocks/monotonic-clock.wit \
	wit/deps/wasi-clocks/system-clock.wit \
	wit/deps/wasi-clocks/timezone.wit \
	wit/deps/wasi-clocks/types.wit \
	wit/deps/wasi-clocks/world.wit \
	wit/deps/wasi-filesystem/preopens.wit \
	wit/deps/wasi-filesystem/types.wit \
	wit/deps/wasi-filesystem/world.wit \
	wit/deps/wasi-http/types.wit \
	wit/deps/wasi-http/worlds.wit \
	wit/deps/wasi-logging-0.1.0-draft/package.wit \
	wit/deps/wasi-random/insecure-seed.wit \
	wit/deps/wasi-random/insecure.wit \
	wit/deps/wasi-random/random.wit \
	wit/deps/wasi-random/world.wit \
	wit/deps/wasi-sockets/ip-name-lookup.wit \
	wit/deps/wasi-sockets/types.wit \
	wit/deps/wasi-sockets/world.wit

# Guest (Rust) sources: everything cargo reads to produce the component
RS_SRCS := \
	Cargo.toml \
	Cargo.lock \
	src/lib.rs \
	src/args.rs \
	src/git_server.rs \
	src/upload_pack.rs \
	$(WIT_SRCS)

# Node toolchain inputs (jco / webpack / babel / tsc versions and settings)
NODE_DEPS := \
	package.json \
	pnpm-lock.yaml

WEBPACK_SRCS := \
	main.ts \
	textencoderdecoder.ts \
	webpack.config.js \
	babel.config.json \
	tsconfig.json

JCO_MAPS := \
	--map 'example:resouceex/example-resource=$(JCO_SHIM_DIR)/example-resouceex.ts' \
	--map 'gas:logger/logger=$(JCO_SHIM_DIR)/gas-logger.ts' \
	--map 'gas:drive-app/gas-drive-app=$(JCO_SHIM_DIR)/gas-driveapp.ts' \
	--map 'gas:drive-app/gas-file=$(JCO_SHIM_DIR)/gas-driveapp-file.ts' \
	--map 'gas:drive-app/gas-access=$(JCO_SHIM_DIR)/gas-driveapp-file.ts' \
	--map 'gas:drive-app/gas-blob=$(JCO_SHIM_DIR)/gas-driveapp-blob.ts' \
	--map 'gas:property/properties=$(JCO_SHIM_DIR)/gas-property-properties.ts' \
	--map 'gas:property/properties-service=$(JCO_SHIM_DIR)/gas-property-properties-service.ts' \
	--map 'gas:spreadsheet-app/gas-spreadsheet-app=$(JCO_SHIM_DIR)/gas-spreadsheetapp.ts' \
	--map 'gas:spreadsheet-app/gas-spreadsheet=$(JCO_SHIM_DIR)/gas-spreadsheetapp-spreadsheet.ts' \
	--map 'gas:spreadsheet-app/gas-range=$(JCO_SHIM_DIR)/gas-spreadsheetapp-range.ts' \
	--map 'gas:spreadsheet-app/gas-sheet=$(JCO_SHIM_DIR)/gas-spreadsheetapp-sheet.ts' \
	--map 'gas:content-service/gas-content-service=$(JCO_SHIM_DIR)/gas-content-service.ts' \
	--map 'gas:content-service/gas-text-output=$(JCO_SHIM_DIR)/gas-content-service-text-output.ts' \
	--map 'gas:urlfetchapp/gas-url-fetch-app=$(JCO_SHIM_DIR)/gas-urlfetchapp.ts' \
	--map 'gas:urlfetchapp/gas-http-response=$(JCO_SHIM_DIR)/gas-urlfetchapp-httpresponse.ts' \
	--map 'gas:utilities/gas-utilities=$(JCO_SHIM_DIR)/gas-utilities.ts' \
	--map 'gas:html-service/gas-html-service=$(JCO_SHIM_DIR)/gas-html-service.ts' \
	--map 'gas:html-service/gas-html-output=$(JCO_SHIM_DIR)/gas-html-service-output.ts' \
	--map 'gas:cache-service/gas-cache-service=$(JCO_SHIM_DIR)/gas-cache-service.ts' \
	--map 'gas:cache-service/gas-cache=$(JCO_SHIM_DIR)/gas-cache-service-cache.ts' \
	--map 'gas:lock-service/gas-lock-service=$(JCO_SHIM_DIR)/gas-lock-service.ts' \
	--map 'gas:lock-service/gas-lock=$(JCO_SHIM_DIR)/gas-lock-service-lock.ts' \
	--map 'gas:session/gas-session=$(JCO_SHIM_DIR)/gas-session.ts' \
	--map 'gas:mail-app/gas-mail-app=$(JCO_SHIM_DIR)/gas-mail-app.ts' \
	--map 'gas:gmail-app/gas-gmail-app=$(JCO_SHIM_DIR)/gas-gmail-app.ts' \
	--map 'gas:gmail-app/gas-gmail-types=$(JCO_SHIM_DIR)/gas-gmail-types.ts' \
	--map 'gas:calendar-app/gas-calendar-app=$(JCO_SHIM_DIR)/gas-calendar-app.ts' \
	--map 'gas:calendar-app/gas-calendar-types=$(JCO_SHIM_DIR)/gas-calendar-types.ts' \
	--map 'gas:document-app/gas-document-app=$(JCO_SHIM_DIR)/gas-document-app.ts' \
	--map 'gas:document-app/gas-document-types=$(JCO_SHIM_DIR)/gas-document-types.ts' \
	--map 'gas:script-app/gas-script-app=$(JCO_SHIM_DIR)/gas-script-app.ts' \
	--map 'gas:script-app/gas-script-types=$(JCO_SHIM_DIR)/gas-script-types.ts' \
	--map 'gas:math/gas-math=$(JCO_SHIM_DIR)/gas-math.ts' \
	--map 'wasi:logging/logging=$(JCO_SHIM_DIR)/log-host.ts' \
	--map 'wasi:random/random=$(JCO_SHIM_DIR)/wasi-random.ts' \
	--map 'wasi:random/random@0.2.0=$(JCO_SHIM_DIR)/wasi-random.ts' \
	--map 'wasi:random/random@0.3.2=$(JCO_SHIM_DIR)/wasi-random.ts' \
	--map 'wasi:random/insecure=$(JCO_SHIM_DIR)/wasi-random.ts' \
	--map 'wasi:random/insecure@0.2.0=$(JCO_SHIM_DIR)/wasi-random.ts' \
	--map 'wasi:random/insecure@0.3.2=$(JCO_SHIM_DIR)/wasi-random.ts' \
	--map 'wasi:random/insecure-seed=$(JCO_SHIM_DIR)/wasi-random.ts' \
	--map 'wasi:random/insecure-seed@0.2.0=$(JCO_SHIM_DIR)/wasi-random.ts' \
	--map 'wasi:random/insecure-seed@0.3.2=$(JCO_SHIM_DIR)/wasi-random.ts' \
	--map 'wasi:clocks/types=$(JCO_SHIM_DIR)/wasi-clocks.ts' \
	--map 'wasi:clocks/types@0.3.2=$(JCO_SHIM_DIR)/wasi-clocks.ts' \
	--map 'wasi:clocks/system-clock=$(JCO_SHIM_DIR)/wasi-clocks.ts' \
	--map 'wasi:clocks/system-clock@0.3.2=$(JCO_SHIM_DIR)/wasi-clocks.ts' \
	--map 'wasi:clocks/timezone=$(JCO_SHIM_DIR)/wasi-clocks.ts' \
	--map 'wasi:clocks/timezone@0.3.2=$(JCO_SHIM_DIR)/wasi-clocks.ts' \
	--map 'wasi:clocks/wall-clock=$(JCO_SHIM_DIR)/wasi-wall-clock.ts' \
	--map 'wasi:clocks/wall-clock@0.2.0=$(JCO_SHIM_DIR)/wasi-wall-clock.ts' \
	--map 'wasi:clocks/monotonic-clock=$(JCO_SHIM_DIR)/wasi-monotonic-clock.ts' \
	--map 'wasi:clocks/monotonic-clock@0.2.0=$(JCO_SHIM_DIR)/wasi-monotonic-clock.ts' \
	--map 'wasi:clocks/monotonic-clock@0.3.2=$(JCO_SHIM_DIR)/wasi-monotonic-clock.ts' \
	--map 'wasi:cli/environment=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/environment@0.2.0=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/environment@0.3.2=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/exit=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/exit@0.2.0=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/exit@0.3.2=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/stdin=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/stdin@0.2.0=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/stdin@0.3.2=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/stdout=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/stdout@0.2.0=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/stdout@0.3.2=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/stderr=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/stderr@0.2.0=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/stderr@0.3.2=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/terminal-input=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/terminal-input@0.2.0=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/terminal-input@0.3.2=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/terminal-output=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/terminal-output@0.2.0=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/terminal-output@0.3.2=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/terminal-stdin=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/terminal-stdin@0.2.0=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/terminal-stdin@0.3.2=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/terminal-stdout=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/terminal-stdout@0.2.0=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/terminal-stdout@0.3.2=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/terminal-stderr=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/terminal-stderr@0.2.0=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:cli/terminal-stderr@0.3.2=$(JCO_SHIM_DIR)/wasi-cli.ts' \
	--map 'wasi:io/streams=$(JCO_SHIM_DIR)/wasi-io.ts' \
	--map 'wasi:io/streams@0.2.0=$(JCO_SHIM_DIR)/wasi-io.ts' \
	--map 'wasi:io/poll=$(JCO_SHIM_DIR)/wasi-io.ts' \
	--map 'wasi:io/poll@0.2.0=$(JCO_SHIM_DIR)/wasi-io.ts' \
	--map 'wasi:io/error=$(JCO_SHIM_DIR)/wasi-io.ts' \
	--map 'wasi:io/error@0.2.0=$(JCO_SHIM_DIR)/wasi-io.ts' \
	--map 'wasi:filesystem/types=$(JCO_SHIM_DIR)/wasi-filesystem.ts' \
	--map 'wasi:filesystem/types@0.2.0=$(JCO_SHIM_DIR)/wasi-filesystem.ts' \
	--map 'wasi:filesystem/types@0.3.2=$(JCO_SHIM_DIR)/wasi-filesystem.ts' \
	--map 'wasi:filesystem/preopens=$(JCO_SHIM_DIR)/wasi-filesystem.ts' \
	--map 'wasi:filesystem/preopens@0.2.0=$(JCO_SHIM_DIR)/wasi-filesystem.ts' \
	--map 'wasi:filesystem/preopens@0.3.2=$(JCO_SHIM_DIR)/wasi-filesystem.ts' \
	--map 'wasi:sockets/types=$(JCO_SHIM_DIR)/wasi-sockets.ts' \
	--map 'wasi:sockets/types@0.2.0=$(JCO_SHIM_DIR)/wasi-sockets.ts' \
	--map 'wasi:sockets/types@0.3.2=$(JCO_SHIM_DIR)/wasi-sockets.ts' \
	--map 'wasi:sockets/ip-name-lookup=$(JCO_SHIM_DIR)/wasi-sockets.ts' \
	--map 'wasi:sockets/ip-name-lookup@0.2.0=$(JCO_SHIM_DIR)/wasi-sockets.ts' \
	--map 'wasi:sockets/ip-name-lookup@0.3.2=$(JCO_SHIM_DIR)/wasi-sockets.ts' \
	--map 'wasi:http/types=$(JCO_SHIM_DIR)/wasi-http.ts' \
	--map 'wasi:http/types@0.2.0=$(JCO_SHIM_DIR)/wasi-http.ts' \
	--map 'wasi:http/types@0.3.2=$(JCO_SHIM_DIR)/wasi-http.ts' \
	--map 'wasi:http/client=$(JCO_SHIM_DIR)/wasi-http.ts' \
	--map 'wasi:http/client@0.3.2=$(JCO_SHIM_DIR)/wasi-http.ts' \
	--map 'wasi:http/handler=$(JCO_SHIM_DIR)/wasi-http.ts' \
	--map 'wasi:http/handler@0.3.2=$(JCO_SHIM_DIR)/wasi-http.ts' \
	--map 'wasi:http/outgoing-handler=$(JCO_SHIM_DIR)/wasi-http.ts' \
	--map 'wasi:http/outgoing-handler@0.2.0=$(JCO_SHIM_DIR)/wasi-http.ts'

# ---------------------------------------------------------------------------
# Rules
# ---------------------------------------------------------------------------

# Gleam + Lustre Web UI -> single self-contained dist/index.html.
# `gleam build` is incremental, so the previous `rm -rf web/build/...` (full rebuild) is gone.
$(DIST_HTML): $(GLEAM_SRCS) $(UI_BUNDLER) $(NODE_DEPS)
	@mkdir -p $(@D)
	@if command -v gleam >/dev/null 2>&1; then \
		echo "Building Gleam + Lustre Web UI (target=javascript)..."; \
		cd web && gleam build --target javascript; \
	else \
		echo "gleam CLI not found; bundling with fallback runtime"; \
	fi
	node ./$(UI_BUNDLER)

# Rust -> WebAssembly component. cargo does not rewrite an up-to-date artifact, so the
# output is touched to keep make's timestamps consistent (otherwise cargo would be
# re-invoked on every make run).
$(WASM_SRC): $(RS_SRCS)
	cargo build $(CARGO_FLAGS)
	@touch $@

# Glue code generation + GAS V8 fast Base64 / WebAssembly.Module loader patch.
# Makefile is a prerequisite because it holds the --map table.
$(JCO_JS): $(WASM_SRC) tools/optimize_jco_gas.mjs $(NODE_DEPS) Makefile
	@mkdir -p $(@D)
	@echo "pnpm exec jco transpile $(WASM_SRC) -o $(JCO_OUT_DIR) $(JCO_FLAGS) --map ..."
	@pnpm exec jco transpile $(WASM_SRC) -o $(JCO_OUT_DIR) $(JCO_FLAGS) $(JCO_MAPS)
	node ./tools/optimize_jco_gas.mjs $@
	@touch $@

# Bundle for GAS. Type checking runs as a separate, parallel step ($(TYPECHECK_STAMP)).
# webpack skips writing an unchanged main.js, so touch it to keep the timestamp ahead of
# its prerequisites (otherwise make would re-run webpack on every invocation).
$(DIST_JS): $(JCO_JS) $(JS_SHIMS) $(WEBPACK_SRCS) $(NODE_DEPS)
	pnpm exec webpack
	@touch $@

$(TYPECHECK_STAMP): $(JCO_JS) $(JS_SHIMS) $(WEBPACK_SRCS) $(NODE_DEPS)
	pnpm exec tsc --noEmit -p tsconfig.json
	@touch $@

$(DIST_MANIFEST): appsscript.json
	@mkdir -p $(@D)
	cp $< $@

build-ui: $(DIST_HTML)

build-wasm: $(WASM_SRC)

typecheck: $(TYPECHECK_STAMP)

build-pack: $(DIST_JS) $(DIST_HTML) $(DIST_MANIFEST) $(TYPECHECK_STAMP)

push: build-pack
	pnpm exec clasp push

check: $(TYPECHECK_STAMP)
	cargo test --locked

# Install pinned Node dependencies exactly as recorded in pnpm-lock.yaml.
setup:
	rustup target add wasm32-wasip2
	pnpm install --frozen-lockfile

# Remove all build outputs (dist, target, web/build)
clean:
	rm -rf dist target web/build

# Full clean build
rebuild:
	$(MAKE) clean
	$(MAKE) build-pack BUILD=$(BUILD)

# Full clean build + clasp push
rebuild-push:
	$(MAKE) clean
	$(MAKE) push BUILD=$(BUILD)

install-git-remote-gas:
	mkdir -p $(HOME)/.local/bin
	install -m 0755 ./tools/git-remote-gas $(HOME)/.local/bin/git-remote-gas
	@echo "Installed git-remote-gas to $(HOME)/.local/bin/git-remote-gas"

test-git-e2e: $(DIST_HTML)
	python3 ./tools/test_gas_git_e2e.py

.PHONY: build-ui build-wasm typecheck build-pack push check setup clean rebuild rebuild-push \
	install-git-remote-gas test-git-e2e
