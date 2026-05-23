# mcpserver-opencode-plugin

OpenCode plugin for McpServer workspace automation.

The package exports `createMcpServerPlugin(config?)` which returns an OpenCode
plugin registering MCP TODO, session-log, requirements, GraphRAG, and workspace
initialization tools through OpenCode's custom tool surface. Tool results are
plain JSON objects.

Failsafe YAML replay files are written under:

```text
.mcpServer/failsafe/opencode
```

## Installation

### As a local plugin

Place in your project's `.opencode/plugins/` or global `~/.config/opencode/plugins/`:

```bash
cp -r dist/ .opencode/plugins/mcpserver-opencode-plugin
```

### As an npm package (future)

```json
{
  "plugin": ["@sharpninja/mcpserver-opencode-plugin"]
}
```

## Usage

The plugin auto-bootstraps from `AGENTS-README-FIRST.yaml` marker files and
delegates all MCP operations through `mcpserver-repl --agent-stdio`.

Available tools:

- **Workspace**: `workspace_ensure`
- **TODO**: `todo_query`, `todo_get`, `todo_select`, `todo_create`, `todo_update`,
  `todo_update_selected`, `todo_delete`, `todo_stream_status`, `todo_stream_plan`,
  `todo_stream_implement`, `todo_analyze_requirements`, `todo_internal_status`,
  `todo_internal_enable`, `todo_internal_disable`, `todo_internal_tracking`
- **Session**: `session_bootstrap`, `session_open`, `session_begin_turn`,
  `session_update_turn`, `session_append_dialog`, `session_append_actions`,
  `session_complete_turn`, `session_fail_turn`, `session_query_history`, `session_close`
- **Requirements**: `req_list_fr`, `req_get_fr`, `req_create_fr`, `req_update_fr`,
  `req_delete_fr`, `req_list_tr`, `req_create_tr`, `req_update_tr`, `req_delete_tr`,
  `req_list_test`, `req_create_test`, `req_update_test`, `req_delete_test`,
  `req_list_mappings`, `req_create_mapping`, `req_delete_mapping`,
  `req_generate_document`, `req_ingest_document`
- **GraphRAG**: `graphrag_status`, `graphrag_index`, `graphrag_query`,
  `graphrag_ingest`, `graphrag_doc_list`, `graphrag_doc_chunks`, `graphrag_doc_delete`,
  `graphrag_entity_create`, `graphrag_entity_list`, `graphrag_entity_get`,
  `graphrag_entity_update`, `graphrag_entity_delete`, `graphrag_rel_create`,
  `graphrag_rel_list`, `graphrag_rel_get`, `graphrag_rel_update`, `graphrag_rel_delete`

## Development

```bash
npm install
npm run build
npm test -- --runInBand
npm pack --dry-run
```

## License

MIT
