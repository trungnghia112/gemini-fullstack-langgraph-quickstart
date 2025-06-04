.PHONY: all format lint test tests test_watch integration_tests docker_tests help extended_tests dev venv setup

# Default target executed when no arguments are given to make.
all: help

# Define a variable for the test file path.
TEST_FILE ?= tests/unit_tests/

test:
	uv run --with-editable . pytest $(TEST_FILE)

test_watch:
	uv run --with-editable . ptw --snapshot-update --now . -- -vv tests/unit_tests

test_profile:
	uv run --with-editable . pytest -vv tests/unit_tests/ --profile-svg

extended_tests:
	uv run --with-editable . pytest --only-extended $(TEST_FILE)

venv:
	@if [ ! -d "venv" ]; then \
		python3 -m venv venv; \
		echo "Virtual environment created."; \
	else \
		echo "Virtual environment already exists."; \
	fi

setup: venv
	@echo "Installing dependencies..."
	@./venv/bin/pip install -e ".[dev]" uvicorn

dev: venv
	./venv/bin/python -m uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

######################
# LINTING AND FORMATTING
######################

# Define a variable for Python and notebook files.
PYTHON_FILES=src/
MYPY_CACHE=.mypy_cache
lint format: PYTHON_FILES=.
lint_diff format_diff: PYTHON_FILES=$(shell git diff --name-only --diff-filter=d main | grep -E '\.py$$|\.ipynb$$')
lint_package: PYTHON_FILES=src
lint_tests: PYTHON_FILES=tests
lint_tests: MYPY_CACHE=.mypy_cache_test

lint lint_diff lint_package lint_tests:
	uv run ruff check .
	[ "$(PYTHON_FILES)" = "" ] || uv run ruff format $(PYTHON_FILES) --diff
	[ "$(PYTHON_FILES)" = "" ] || uv run ruff check --select I $(PYTHON_FILES)
	[ "$(PYTHON_FILES)" = "" ] || uv run mypy --strict $(PYTHON_FILES)
	[ "$(PYTHON_FILES)" = "" ] || mkdir -p $(MYPY_CACHE) && uv run mypy --strict $(PYTHON_FILES) --cache-dir $(MYPY_CACHE)

format format_diff:
	uv run ruff format $(PYTHON_FILES)
	uv run ruff check --select I --fix $(PYTHON_FILES)

spell_check:
	codespell --toml pyproject.toml

spell_fix:
	codespell --toml pyproject.toml -w

######################
# HELP
######################

help:
	@echo '----'
	@echo 'format                       - run code formatters'
	@echo 'lint                         - run linters'
	@echo 'test                         - run unit tests'
	@echo 'tests                        - run unit tests'
	@echo 'test TEST_FILE=<test_file>   - run all tests in file'
	@echo 'test_watch                   - run unit tests in watch mode'
	@echo 'venv                         - create a virtual environment if it does not exist'
	@echo 'setup                        - set up the virtual environment with all dependencies'
	@echo 'dev                          - run development server with hot reload'

