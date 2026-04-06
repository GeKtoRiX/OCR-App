# OCR-App MCP Server

Реальный MCP server для OCR-App находится в [`scripts/mcp-server.js`](/mnt/HDD_Store/ocrProject/scripts/mcp-server.js) и работает через `stdio` на `@modelcontextprotocol/sdk`.

Основной entrypoint:
- [`scripts/mcp-server.js`](/mnt/HDD_Store/ocrProject/scripts/mcp-server.js)

Compatibility wrapper / deprecated entrypoint:
- [`scripts/mcp-vocab-server.js`](/mnt/HDD_Store/ocrProject/scripts/mcp-vocab-server.js)
- Этот файл не содержит второй реализации сервера и только вызывает основной entrypoint для обратной совместимости.

## Что использует сервер

- `data/documents.sqlite`
- `data/vocabulary.sqlite`
- `data/ocr-app.db`
- `logs/`
- `test-results/`
- `tmp/perf/logs/` если каталог существует
- `tmp/e2e-logs/` если каталог существует
- `scripts/linux/ocr.sh status`
- `http://127.0.0.1:3000/api/health` или `OCR_APP_GATEWAY_URL`
- `http://127.0.0.1:1234/v1/models` или `OCR_APP_LM_STUDIO_MODELS_URL`

## Запуск

Из корня репозитория:

```bash
npm run mcp:project
```

Или напрямую:

```bash
node scripts/mcp-server.js
```

Compatibility wrapper, если нужен старый путь запуска:

```bash
node scripts/mcp-vocab-server.js
```

## Smoke check

```bash
npm run smoke:mcp
```

Smoke test поднимает сервер как subprocess и выполняет:

- `initialize`
- `tools/list`
- `resources/list`
- `resources/read` для `ocr://project/overview`
- `tools/call` для `list_documents`
- `tools/call` для `list_due_vocabulary`
- `tools/call` для `trace_word_lifecycle`

## Подключение в Codex

```bash
codex mcp add ocr-app -- node /mnt/HDD_Store/ocrProject/scripts/mcp-server.js
```

## Подключение в Claude Desktop

Добавьте в `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ocr-app": {
      "command": "node",
      "args": ["/mnt/HDD_Store/ocrProject/scripts/mcp-server.js"]
    }
  }
}
```

## Подключение в LM Studio

```json
{
  "mcpServers": {
    "ocr-app": {
      "type": "stdio",
      "command": "node",
      "args": ["/mnt/HDD_Store/ocrProject/scripts/mcp-server.js"]
    }
  }
}
```

## Доступные tools

- `get_gateway_json`
- `get_project_health`
- `launcher_status`
- `list_documents`
- `debug_failed_document`
- `get_document`
- `trace_word_lifecycle`
- `search_vocabulary`
- `list_due_vocabulary`
- `list_practice_sessions`
- `get_word_stats`
- `recent_practice_mistakes`
- `db_overview`
- `list_runtime_logs`
- `read_runtime_log`
- `list_test_results`
- `read_test_artifact`

## Доступные resources

- `ocr://project/overview`
- `ocr://databases/summary`
- `ocr://logs/runtime-index`
- `ocr://documents/{id}`
- `ocr://logs/runtime/{filename}`

## Примечания

- Сервер читает только реальные данные проекта и не создаёт фиктивные ответы.
- Для файловых чтений, runtime logs и test artifacts включены проверки путей.
- Для SQLite используются реальные файлы и реальные таблицы, подтверждённые по backend-репозиториям.
- `get_gateway_json` работает только по read-only allowlist путей gateway, а не по произвольным URL.
- `debug_failed_document` полезен для triage проблем документа: он связывает saved document, candidates, linked vocabulary и health snapshot.
- `trace_word_lifecycle` полезен для ежедневной отладки word -> vocabulary -> practice flow.
