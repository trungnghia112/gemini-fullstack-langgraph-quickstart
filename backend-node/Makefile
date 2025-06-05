.PHONY: all build dev start test lint lint-fix clean install help

# Default target
all: help

# Install dependencies
install:
	npm install

# Build the project
build:
	npm run build

# Run in development mode with hot reload
dev:
	npm run dev

# Start the production server
start: build
	npm start

# Run tests
test:
	npm test

# Run tests in watch mode
test-watch:
	npm run test:watch

# Lint the code
lint:
	npm run lint

# Lint and fix the code
lint-fix:
	npm run lint:fix

# Clean build artifacts
clean:
	rm -rf dist
	rm -rf node_modules/.cache

# Setup development environment
setup: install
	@echo "Setting up development environment..."
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "Created .env file from .env.example"; \
		echo "Please update .env with your API keys"; \
	fi

# Check environment
check-env:
	@echo "Checking environment variables..."
	@if [ -z "$$GEMINI_API_KEY" ]; then \
		echo "❌ GEMINI_API_KEY is not set"; \
		exit 1; \
	else \
		echo "✅ GEMINI_API_KEY is set"; \
	fi

# Run with environment check
run: check-env dev

# Help
help:
	@echo "Available commands:"
	@echo "  install     - Install dependencies"
	@echo "  build       - Build the project"
	@echo "  dev         - Run in development mode"
	@echo "  start       - Start production server"
	@echo "  test        - Run tests"
	@echo "  test-watch  - Run tests in watch mode"
	@echo "  lint        - Lint the code"
	@echo "  lint-fix    - Lint and fix the code"
	@echo "  clean       - Clean build artifacts"
	@echo "  setup       - Setup development environment"
	@echo "  check-env   - Check environment variables"
	@echo "  run         - Run with environment check"
