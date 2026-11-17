# Ollama

Shows what the [Ollama](https://ollama.com) server on this PC holds: its models and the ones loaded right now. Ollama
runs models locally, so there is no account, key or quota.

## Overview

- **Protocol:** REST (JSON), documented: [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md)
- **Endpoints:** `GET http://127.0.0.1:11434/api/version`, `/api/tags` (installed models), `/api/ps` (loaded models)
- **Auth:** none

## Setup

1. Install Ollama. The card looks for its `~/.ollama` folder before any request, so a PC without it stays quiet.
2. Turn Ollama on in Settings → Providers (new providers start off).

## Lines

| Label            | Scope    | What it shows                                                  |
| ---------------- | -------- | -------------------------------------------------------------- |
| Installed models | overview | how many, and their size on disk: `4 · 18.3 GB`                |
| Loaded now       | overview | the models in memory, by name, or `—` when none are loaded     |

The badge shows the server's version (`v0.13.0`). A list the server didn't answer is left off the card.

## Errors

| Condition               | Message                                                  |
| ----------------------- | -------------------------------------------------------- |
| No `~/.ollama`          | "Ollama not installed. Install Ollama to get started."   |
| Server not answering    | "Start Ollama or run `ollama serve` and try again."      |
| Neither list answered   | "Usage response invalid. Try again later."               |

Endpoints as [Pane](https://github.com/ItsJazii/pane) (MIT) reads them.
