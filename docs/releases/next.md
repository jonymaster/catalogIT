# Next release

Released notes: [v1.6.x](v1.6.md), [v1.5.2](v1.5.2.md).

## MCP cost record tools

The MCP server can now change cost records. `create_service_cost_record`, `update_service_cost_record`, and `delete_service_cost_record` manage a service's costs; `set_hardware_cost` and `delete_hardware_cost` set or remove a hardware asset's purchase cost. New read tools `get_hardware_cost` and `list_payment_methods` support them, and `get_record_history` accepts `record_type="cost_record"`. Each tool calls the existing API, so writes need an editor or admin with financial visibility (plus hardware visibility for hardware costs), cost records of archived services and hardware stay read-only, and every change is recorded in history under the token owner. Delete tools are annotated as destructive, and cost-record notes are neither returned nor set. The MCP server still cannot delete or archive services, hardware, vendors, or tags. See [MCP and AI assistants](../integrations/mcp.md).
