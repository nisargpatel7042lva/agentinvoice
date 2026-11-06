# Language model notes

Read once from the Anthropic TypeScript SDK docs (Messages API and SDK usage). Cached so later steps do not re-read them.

- Package: `@anthropic-ai/sdk`. Default import `Anthropic`.
- Call: `client.messages.create({ model, max_tokens, system, messages })`.
- `messages` is an array of `{ role: "user" | "assistant", content }`. `content` may be a string.
- There is no system role. Instructions go in the top-level `system` string.
- `max_tokens` is required. It is the maximum output tokens, and the model may stop earlier.
- The SDK reads the API key from `ANTHROPIC_API_KEY` unless `apiKey` is passed. Do not log that value.
- A successful message has `content`: an array of blocks. Use blocks whose `type` is `"text"` and read `text`.
- Structured JSON can be requested with `output_config.format = { type: "json_schema", schema }`. This agent still validates with Zod, so a schema miss becomes escalate.
- `CLAUDE.md` does not name a model. Do not guess one. The review caller receives the model name from the caller.
