.PHONY: help dev lint lint-tauri tauri deps build install clean

.DEFAULT_GOAL := build

help:
	@echo "Whale Play - Available Make Commands"
	@echo "===================================="
	@echo ""
	@echo "Setup:"
	@echo " make deps       Install JS & Rust dependencies"
	@echo ""
	@echo "Develop:"
	@echo " make dev        Start browser dev server (http://localhost:1420)"
	@echo " make tauri      Start Tauri native window (requires Rust)"
	@echo " make lint       Use eslint to check TS code"
	@echo " make test       Run ALL test in ALL code"
	@echo ""
	@echo "Build & Install:"
	@echo " make            Build JS dist + TS check (no Rust)"
	@echo " make install    Build + package native installer (.exe/.AppImage/.dmg)"
	@echo " make clean      Remove build artifacts + deps"

build:
	pnpm build && cd apps/desktop/src-tauri && cargo check

install:
	pnpm build:desktop

deps:
	pnpm install && cd apps/desktop/src-tauri && cargo fetch

lint:
	pnpm lint

format:
	pnpm lint:fix && cd apps/desktop/src-tauri && cargo fmt

test: test-core test-desktop

test-core:
	pnpm --filter @neo-tavern/core test

test-desktop: test-react test-tauri

test-react:
	pnpm --filter @neo-tavern/desktop test

test-tauri:
	cd apps/desktop/src-tauri && cargo test

dev:
	pnpm dev

tauri:
	pnpm tauri dev

clean:
	pnpm clean && cd apps/desktop/src-tauri && cargo clean
