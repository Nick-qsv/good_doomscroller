PYTHON ?= python3
VENV := .venv
PIPELINE := $(VENV)/bin/good-doomscroll

.PHONY: setup dev test lint build pipeline-help compose-up compose-down

setup:
	$(PYTHON) -m venv $(VENV)
	$(VENV)/bin/python -m pip install --upgrade pip
	$(VENV)/bin/python -m pip install -e './pipeline[dev,openai]'
	npm --prefix apps/web ci

dev:
	npm --prefix apps/web run dev

test:
	$(VENV)/bin/python -m pytest pipeline/tests
	npm --prefix apps/web test

lint:
	$(VENV)/bin/python -m ruff check pipeline
	npm --prefix apps/web run lint

build:
	npm --prefix apps/web run build

pipeline-help:
	$(PIPELINE) --help

compose-up:
	docker compose up --build

compose-down:
	docker compose down
