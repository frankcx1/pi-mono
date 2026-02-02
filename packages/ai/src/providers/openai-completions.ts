import OpenAI from "openai";
import type {
	ChatCompletionAssistantMessageParam,
	ChatCompletionChunk,
	ChatCompletionContentPart,
	ChatCompletionContentPartImage,
	ChatCompletionContentPartText,
	ChatCompletionMessageParam,
	ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions.js";
import { getEnvApiKey } from "../env-api-keys.js";
import { calculateCost, supportsXhigh } from "../models.js";
import type {
	AssistantMessage,
	Context,
	Message,
	Model,
	OpenAICompletionsCompat,
	SimpleStreamOptions,
	StopReason,
	StreamFunction,
	StreamOptions,
	TextContent,
	ThinkingContent,
	Tool,
	ToolCall,
	ToolResultMessage,
} from "../types.js";
import { AssistantMessageEventStream } from "../utils/event-stream.js";
import { parseStreamingJson } from "../utils/json-parse.js";
import { sanitizeSurrogates } from "../utils/sanitize-unicode.js";
import { buildBaseOptions, clampReasoning } from "./simple-options.js";
import { transformMessages } from "./transform-messages.js";

/**
 * Normalize tool call ID for Mistral.
 * Mistral requires tool IDs to be exactly 9 alphanumeric characters (a-z, A-Z, 0-9).
 */
function normalizeMistralToolId(id: string): string {
	// Remove non-alphanumeric characters
	let normalized = id.replace(/[^a-zA-Z0-9]/g, "");
	// Mistral requires exactly 9 characters
	if (normalized.length < 9) {
		// Pad with deterministic characters based on original ID to ensure matching
		const padding = "ABCDEFGHI";
		normalized = normalized + padding.slice(0, 9 - normalized.length);
	} else if (normalized.length > 9) {
		normalized = normalized.slice(0, 9);
	}
	return normalized;
}

/**
 * Check if conversation messages contain tool calls or tool results.
 * This is needed because Anthropic (via proxy) requires the tools param
 * to be present when messages include tool_calls or tool role messages.
 */
function hasToolHistory(messages: Message[]): boolean {
	for (const msg of messages) {
		if (msg.role === "toolResult") {
			return true;
		}
		if (msg.role === "assistant") {
			if (msg.content.some((block) => block.type === "toolCall")) {
				return true;
			}
		}
	}
	return false;
}

export interface OpenAICompletionsOptions extends StreamOptions {
	toolChoice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
	reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
}

export const streamOpenAICompletions: StreamFunction<"openai-completions", OpenAICompletionsOptions> = (
	model: Model<"openai-completions">,
	context: Context,
	options?: OpenAICompletionsOptions,
): AssistantMessageEventStream => {
	const stream = new AssistantMessageEventStream();

	(async () => {
		const output: AssistantMessage = {
			role: "assistant",
			content: [],
			api: model.api,
			provider: model.provider,
			model: model.id,
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		};

		try {
			const apiKey = options?.apiKey || getEnvApiKey(model.provider) || "";
			const client = createClient(model, context, apiKey, options?.headers);
			const _compat = getCompat(model);
			const _isToolsViaPrompt = _compat.toolsViaPrompt && context.tools && context.tools.length > 0;
			let _viaPromptBuffer = "";
			const params = buildParams(model, context, options);
			options?.onPayload?.(params);
			const openaiStream = await client.chat.completions.create(params, { signal: options?.signal });
			stream.push({ type: "start", partial: output });

			let currentBlock:
				| TextContent
				| ThinkingContent
				| (ToolCall & { partialArgs?: string; _isTextResponse?: boolean })
				| null = null;
			let _suppressToolContent = false;
			const blocks = output.content;
			const blockIndex = () => blocks.length - 1;
			const finishCurrentBlock = (block?: typeof currentBlock) => {
				if (block) {
					if (block.type === "text") {
						stream.push({
							type: "text_end",
							contentIndex: blockIndex(),
							content: block.text,
							partial: output,
						});
					} else if (block.type === "thinking") {
						stream.push({
							type: "thinking_end",
							contentIndex: blockIndex(),
							content: block.thinking,
							partial: output,
						});
					} else if (block.type === "toolCall") {
						if ((block as any)._isTextResponse || block.name === "__text_response") {
							// Convert __text_response tool call to a text block
							const args = JSON.parse(block.partialArgs || "{}");
							const text = args.text || "";
							const idx = blocks.indexOf(block);
							const textBlock: TextContent = { type: "text", text };
							if (idx >= 0) (blocks as any)[idx] = textBlock;
							const ci = idx >= 0 ? idx : blockIndex();
							stream.push({ type: "text_start", contentIndex: ci, partial: output });
							stream.push({ type: "text_delta", contentIndex: ci, delta: text, partial: output });
							stream.push({ type: "text_end", contentIndex: ci, content: text, partial: output });
						} else {
							block.arguments = JSON.parse(block.partialArgs || "{}");
							delete block.partialArgs;
							stream.push({
								type: "toolcall_end",
								contentIndex: blockIndex(),
								toolCall: block,
								partial: output,
							});
						}
					}
				}
			};

			for await (const chunk of openaiStream) {
				if (chunk.usage) {
					const cachedTokens = chunk.usage.prompt_tokens_details?.cached_tokens || 0;
					const reasoningTokens = chunk.usage.completion_tokens_details?.reasoning_tokens || 0;
					const input = (chunk.usage.prompt_tokens || 0) - cachedTokens;
					const outputTokens = (chunk.usage.completion_tokens || 0) + reasoningTokens;
					output.usage = {
						// OpenAI includes cached tokens in prompt_tokens, so subtract to get non-cached input
						input,
						output: outputTokens,
						cacheRead: cachedTokens,
						cacheWrite: 0,
						// Compute totalTokens ourselves since we add reasoning_tokens to output
						// and some providers (e.g., Groq) don't include them in total_tokens
						totalTokens: input + outputTokens + cachedTokens,
						cost: {
							input: 0,
							output: 0,
							cacheRead: 0,
							cacheWrite: 0,
							total: 0,
						},
					};
					calculateCost(model, output.usage);
				}

				const choice = chunk.choices[0];
				if (!choice) continue;

				if (choice.finish_reason) {
					output.stopReason = mapStopReason(choice.finish_reason);
				}

				if (choice.delta) {
					// Suppress content that contains raw tool call tokens (Foundry Local quirk:
					// returns <|tool_call|>...<|/tool_call|> in content alongside parsed tool_calls)
					if (
						choice.delta.content &&
						(choice.delta.content.includes("<|tool_call|>") || choice.delta.content.includes("<|/tool_call|>"))
					) {
						_suppressToolContent = true;
					}
					if (choice.delta.tool_calls && choice.delta.tool_calls.length > 0) {
						_suppressToolContent = false;
					}

					if (
						choice.delta.content !== null &&
						choice.delta.content !== undefined &&
						choice.delta.content.length > 0 &&
						!_suppressToolContent
					) {
						// toolsViaPrompt: buffer content for post-processing instead of emitting
						if (_isToolsViaPrompt) {
							_viaPromptBuffer += choice.delta.content;
						} else if (!currentBlock || currentBlock.type !== "text") {
							finishCurrentBlock(currentBlock);
							currentBlock = { type: "text", text: "" };
							output.content.push(currentBlock);
							stream.push({ type: "text_start", contentIndex: blockIndex(), partial: output });
						}

						if (!_isToolsViaPrompt && currentBlock?.type === "text") {
							currentBlock.text += choice.delta.content;
							stream.push({
								type: "text_delta",
								contentIndex: blockIndex(),
								delta: choice.delta.content,
								partial: output,
							});
						}
					}

					// Some endpoints return reasoning in reasoning_content (llama.cpp),
					// or reasoning (other openai compatible endpoints)
					// Use the first non-empty reasoning field to avoid duplication
					// (e.g., chutes.ai returns both reasoning_content and reasoning with same content)
					const reasoningFields = ["reasoning_content", "reasoning", "reasoning_text"];
					let foundReasoningField: string | null = null;
					for (const field of reasoningFields) {
						if (
							(choice.delta as any)[field] !== null &&
							(choice.delta as any)[field] !== undefined &&
							(choice.delta as any)[field].length > 0
						) {
							if (!foundReasoningField) {
								foundReasoningField = field;
								break;
							}
						}
					}

					if (foundReasoningField) {
						if (!currentBlock || currentBlock.type !== "thinking") {
							finishCurrentBlock(currentBlock);
							currentBlock = {
								type: "thinking",
								thinking: "",
								thinkingSignature: foundReasoningField,
							};
							output.content.push(currentBlock);
							stream.push({ type: "thinking_start", contentIndex: blockIndex(), partial: output });
						}

						if (currentBlock.type === "thinking") {
							const delta = (choice.delta as any)[foundReasoningField];
							currentBlock.thinking += delta;
							stream.push({
								type: "thinking_delta",
								contentIndex: blockIndex(),
								delta,
								partial: output,
							});
						}
					}

					if (choice?.delta?.tool_calls) {
						for (const toolCall of choice.delta.tool_calls) {
							if (
								!currentBlock ||
								currentBlock.type !== "toolCall" ||
								(toolCall.id && currentBlock.id !== toolCall.id)
							) {
								finishCurrentBlock(currentBlock);
								const isTextResponse = toolCall.function?.name === "__text_response";
								currentBlock = {
									type: "toolCall",
									id: toolCall.id || "",
									name: toolCall.function?.name || "",
									arguments: {},
									partialArgs: "",
									_isTextResponse: isTextResponse,
								};
								output.content.push(currentBlock);
								if (!isTextResponse) {
									stream.push({ type: "toolcall_start", contentIndex: blockIndex(), partial: output });
								}
							}

							if (currentBlock.type === "toolCall") {
								if (toolCall.id) currentBlock.id = toolCall.id;
								if (toolCall.function?.name) {
									currentBlock.name = toolCall.function.name;
									if (toolCall.function.name === "__text_response") {
										(currentBlock as any)._isTextResponse = true;
									}
								}
								let delta = "";
								if (toolCall.function?.arguments) {
									delta = toolCall.function.arguments;
									currentBlock.partialArgs += toolCall.function.arguments;
									currentBlock.arguments = parseStreamingJson(currentBlock.partialArgs);
								}
								if (!(currentBlock as any)._isTextResponse) {
									stream.push({
										type: "toolcall_delta",
										contentIndex: blockIndex(),
										delta,
										partial: output,
									});
								}
							}
						}
					}

					const reasoningDetails = (choice.delta as any).reasoning_details;
					if (reasoningDetails && Array.isArray(reasoningDetails)) {
						for (const detail of reasoningDetails) {
							if (detail.type === "reasoning.encrypted" && detail.id && detail.data) {
								const matchingToolCall = output.content.find(
									(b) => b.type === "toolCall" && b.id === detail.id,
								) as ToolCall | undefined;
								if (matchingToolCall) {
									matchingToolCall.thoughtSignature = JSON.stringify(detail);
								}
							}
						}
					}
				}
			}

			finishCurrentBlock(currentBlock);

			// toolsViaPrompt: parse buffered content for [TOOL_CALL] markers
			if (_isToolsViaPrompt && _viaPromptBuffer.length > 0) {
				const tcMatch = _viaPromptBuffer.match(
					/\[TOOL_(?:CALL|RESPONSE)\]\s*([\s\S]*?)\s*\[\/TOOL_(?:CALL|RESPONSE)\]/,
				);
				if (tcMatch) {
					try {
						const parsed = JSON.parse(tcMatch[1]);
						// Schema-based argument validation: strip invalid/unknown arguments
						// that the model hallucinates (e.g. exec: env: "normal", workdir: "null")
						if (parsed.arguments && typeof parsed.arguments === "object" && parsed.name !== "__text_response") {
							const toolDef = context.tools?.find((t) => t.name === parsed.name);
							const schemaProps = (toolDef?.parameters as any)?.properties || {};
							const schemaKeys = Object.keys(schemaProps);
							for (const key of Object.keys(parsed.arguments)) {
								const val = parsed.arguments[key];
								// Strip null/null-string values
								if (val === "null" || val === null) {
									delete parsed.arguments[key];
									continue;
								}
								// Strip arguments not in the tool's schema
								if (schemaKeys.length > 0 && !schemaKeys.includes(key)) {
									delete parsed.arguments[key];
									continue;
								}
								// Strip type mismatches (e.g. string "normal" for object-type param)
								const expectedType = schemaProps[key]?.type;
								if (expectedType && expectedType !== "string" && typeof val === "string") {
									delete parsed.arguments[key];
								}
							}
						} else if (parsed.arguments && typeof parsed.arguments === "object") {
							// Strip null/null-string for __text_response too
							for (const key of Object.keys(parsed.arguments)) {
								if (parsed.arguments[key] === "null" || parsed.arguments[key] === null) {
									delete parsed.arguments[key];
								}
							}
						}

						if (parsed.name === "__text_response") {
							// Convert to text response
							const text = parsed.arguments?.text || "";
							const textBlock: TextContent = { type: "text", text };
							blocks.push(textBlock);
							stream.push({ type: "text_start", contentIndex: blockIndex(), partial: output });
							stream.push({ type: "text_delta", contentIndex: blockIndex(), delta: text, partial: output });
							stream.push({ type: "text_end", contentIndex: blockIndex(), content: text, partial: output });
						} else {
							// Create tool call block
							const tcId = Math.random().toString(36).slice(2, 11);
							const toolBlock: ToolCall = {
								type: "toolCall",
								id: tcId,
								name: parsed.name,
								arguments: parsed.arguments || {},
							};
							blocks.push(toolBlock);
							stream.push({ type: "toolcall_start", contentIndex: blockIndex(), partial: output });
							stream.push({
								type: "toolcall_delta",
								contentIndex: blockIndex(),
								delta: JSON.stringify(parsed.arguments || {}),
								partial: output,
							});
							stream.push({
								type: "toolcall_end",
								contentIndex: blockIndex(),
								toolCall: toolBlock,
								partial: output,
							});
							output.stopReason = "toolUse";
						}
					} catch {
						// JSON parse failed, strip markers and emit as plain text
						const cleaned = _viaPromptBuffer.replace(/\[\/?(TOOL_CALL|TOOL_RESULT|TOOL_RESPONSE)\]/g, "").trim();
						const fallback = cleaned || _viaPromptBuffer;
						const textBlock: TextContent = { type: "text", text: fallback };
						blocks.push(textBlock);
						stream.push({ type: "text_start", contentIndex: blockIndex(), partial: output });
						stream.push({ type: "text_delta", contentIndex: blockIndex(), delta: fallback, partial: output });
						stream.push({ type: "text_end", contentIndex: blockIndex(), content: fallback, partial: output });
					}
				} else {
					// No [TOOL_CALL] markers found — try parsing as bare JSON (model sometimes omits markers)
					let bareJsonHandled = false;
					const trimmed = _viaPromptBuffer.trim();
					if (trimmed.startsWith("{")) {
						try {
							const bareJson = JSON.parse(trimmed);
							if (
								bareJson.name &&
								typeof bareJson.name === "string" &&
								bareJson.arguments &&
								typeof bareJson.arguments === "object"
							) {
								bareJsonHandled = true;
								// Apply same schema-based validation
								if (bareJson.name !== "__text_response") {
									const toolDef = context.tools?.find((t) => t.name === bareJson.name);
									const schemaProps = (toolDef?.parameters as any)?.properties || {};
									const schemaKeys = Object.keys(schemaProps);
									for (const key of Object.keys(bareJson.arguments)) {
										const val = bareJson.arguments[key];
										if (val === "null" || val === null) {
											delete bareJson.arguments[key];
											continue;
										}
										if (schemaKeys.length > 0 && !schemaKeys.includes(key)) {
											delete bareJson.arguments[key];
											continue;
										}
										const expectedType = schemaProps[key]?.type;
										if (expectedType && expectedType !== "string" && typeof val === "string") {
											delete bareJson.arguments[key];
										}
									}
								}

								if (bareJson.name === "__text_response") {
									const text = bareJson.arguments.text || "";
									const textBlock: TextContent = { type: "text", text };
									blocks.push(textBlock);
									stream.push({ type: "text_start", contentIndex: blockIndex(), partial: output });
									stream.push({
										type: "text_delta",
										contentIndex: blockIndex(),
										delta: text,
										partial: output,
									});
									stream.push({
										type: "text_end",
										contentIndex: blockIndex(),
										content: text,
										partial: output,
									});
								} else {
									const tcId = Math.random().toString(36).slice(2, 11);
									const toolBlock: ToolCall = {
										type: "toolCall",
										id: tcId,
										name: bareJson.name,
										arguments: bareJson.arguments || {},
									};
									blocks.push(toolBlock);
									stream.push({ type: "toolcall_start", contentIndex: blockIndex(), partial: output });
									stream.push({
										type: "toolcall_delta",
										contentIndex: blockIndex(),
										delta: JSON.stringify(bareJson.arguments || {}),
										partial: output,
									});
									stream.push({
										type: "toolcall_end",
										contentIndex: blockIndex(),
										toolCall: toolBlock,
										partial: output,
									});
									output.stopReason = "toolUse";
								}
							}
						} catch {
							/* not valid JSON, fall through */
						}
					}

					if (!bareJsonHandled) {
						// Strip any leaked markers and emit as plain text
						const cleaned = _viaPromptBuffer.replace(/\[\/?(TOOL_CALL|TOOL_RESULT|TOOL_RESPONSE)\]/g, "").trim();
						const fallback = cleaned || _viaPromptBuffer;
						const textBlock: TextContent = { type: "text", text: fallback };
						blocks.push(textBlock);
						stream.push({ type: "text_start", contentIndex: blockIndex(), partial: output });
						stream.push({ type: "text_delta", contentIndex: blockIndex(), delta: fallback, partial: output });
						stream.push({ type: "text_end", contentIndex: blockIndex(), content: fallback, partial: output });
					}
				}
			}

			// If all tool calls were converted to __text_response, fix stopReason
			if (output.stopReason === "toolUse" && !output.content.some((b) => b.type === "toolCall")) {
				output.stopReason = "stop";
			}

			if (options?.signal?.aborted) {
				throw new Error("Request was aborted");
			}

			if (output.stopReason === "aborted" || output.stopReason === "error") {
				throw new Error("An unknown error occurred");
			}

			stream.push({ type: "done", reason: output.stopReason, message: output });
			stream.end();
		} catch (error) {
			for (const block of output.content) delete (block as any).index;
			output.stopReason = options?.signal?.aborted ? "aborted" : "error";
			output.errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
			// Some providers via OpenRouter give additional information in this field.
			const rawMetadata = (error as any)?.error?.metadata?.raw;
			if (rawMetadata) output.errorMessage += `\n${rawMetadata}`;
			stream.push({ type: "error", reason: output.stopReason, error: output });
			stream.end();
		}
	})();

	return stream;
};

export const streamSimpleOpenAICompletions: StreamFunction<"openai-completions", SimpleStreamOptions> = (
	model: Model<"openai-completions">,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream => {
	const apiKey = options?.apiKey || getEnvApiKey(model.provider);
	if (!apiKey) {
		throw new Error(`No API key for provider: ${model.provider}`);
	}

	const base = buildBaseOptions(model, options, apiKey);
	const reasoningEffort = supportsXhigh(model) ? options?.reasoning : clampReasoning(options?.reasoning);
	const toolChoice = (options as OpenAICompletionsOptions | undefined)?.toolChoice;

	return streamOpenAICompletions(model, context, {
		...base,
		reasoningEffort,
		toolChoice,
	} satisfies OpenAICompletionsOptions);
};

function createClient(
	model: Model<"openai-completions">,
	context: Context,
	apiKey?: string,
	optionsHeaders?: Record<string, string>,
) {
	if (!apiKey) {
		if (!process.env.OPENAI_API_KEY) {
			throw new Error(
				"OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass it as an argument.",
			);
		}
		apiKey = process.env.OPENAI_API_KEY;
	}

	const headers = { ...model.headers };
	if (model.provider === "github-copilot") {
		// Copilot expects X-Initiator to indicate whether the request is user-initiated
		// or agent-initiated (e.g. follow-up after assistant/tool messages). If there is
		// no prior message, default to user-initiated.
		const messages = context.messages || [];
		const lastMessage = messages[messages.length - 1];
		const isAgentCall = lastMessage ? lastMessage.role !== "user" : false;
		headers["X-Initiator"] = isAgentCall ? "agent" : "user";
		headers["Openai-Intent"] = "conversation-edits";

		// Copilot requires this header when sending images
		const hasImages = messages.some((msg) => {
			if (msg.role === "user" && Array.isArray(msg.content)) {
				return msg.content.some((c) => c.type === "image");
			}
			if (msg.role === "toolResult" && Array.isArray(msg.content)) {
				return msg.content.some((c) => c.type === "image");
			}
			return false;
		});
		if (hasImages) {
			headers["Copilot-Vision-Request"] = "true";
		}
	}

	// Merge options headers last so they can override defaults
	if (optionsHeaders) {
		Object.assign(headers, optionsHeaders);
	}

	return new OpenAI({
		apiKey,
		baseURL: model.baseUrl,
		dangerouslyAllowBrowser: true,
		defaultHeaders: headers,
	});
}

function buildParams(model: Model<"openai-completions">, context: Context, options?: OpenAICompletionsOptions) {
	const compat = getCompat(model);
	const messages = convertMessages(model, context, compat);
	maybeAddOpenRouterAnthropicCacheControl(model, messages);

	const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
		model: model.id,
		messages,
		stream: true,
	};

	if (compat.supportsUsageInStreaming !== false) {
		(params as any).stream_options = { include_usage: true };
	}

	if (compat.supportsStore) {
		params.store = false;
	}

	if (options?.maxTokens) {
		if (compat.maxTokensField === "max_tokens") {
			(params as any).max_tokens = options.maxTokens;
		} else {
			params.max_completion_tokens = options.maxTokens;
		}
	}

	if (options?.temperature !== undefined) {
		params.temperature = options.temperature;
	}

	if (context.tools) {
		params.tools = convertTools(context.tools, compat);
	} else if (hasToolHistory(context.messages)) {
		// Anthropic (via LiteLLM/proxy) requires tools param when conversation has tool_calls/tool_results
		params.tools = [];
	}

	if (options?.toolChoice) {
		params.tool_choice = options.toolChoice;
	} else if (compat.forceToolChoice && params.tools && params.tools.length > 0) {
		// For models that don't autonomously choose tools (e.g. Foundry Local / Phi-4),
		// force tool_choice=required and add a __text_response escape-hatch tool
		// so the model can respond with text when no real tool is appropriate.
		// Only force on first turn (user message), not after tool results — otherwise
		// the model loops instead of delivering its answer as text.
		const lastMsg = context.messages[context.messages.length - 1];
		const isAfterToolResult = lastMsg && lastMsg.role === "toolResult";
		params.tools.unshift({
			type: "function",
			function: {
				name: "__text_response",
				description:
					"ALWAYS use this tool to respond with plain text. Use for greetings, conversation, opinions, questions, explanations - anything not requiring other tools.",
				parameters: {
					type: "object",
					properties: {
						text: { type: "string", description: "Your complete text response to the user" },
					},
					required: ["text"],
				},
				strict: false,
			},
		});
		if (!isAfterToolResult) {
			params.tool_choice = "required";
		}
	}

	// toolsViaPrompt: for models without native tool calling (e.g. Phi Silica),
	// inject format instructions into the system prompt and parse [TOOL_CALL] markers from output.
	if (compat.toolsViaPrompt && context.tools && context.tools.length > 0) {
		// Replace the bulky system prompt with a compact version.
		// Phi Silica loses the [TOOL_CALL] format when the system prompt exceeds ~5K chars.
		// Curated 4 tools with explicit descriptions to prevent wrong-tool selection.
		const compactPrompt =
			"You are Phi, a helpful AI assistant. You have these tools:\n\n" +
			"- read(path): VIEW or READ an existing file\n" +
			"- write(path, content): CREATE or SAVE a NEW file with content\n" +
			"- edit(filePath, old_string, new_string): MODIFY part of an existing file\n" +
			'- exec(command): RUN a shell command. Only needs "command" param.\n' +
			"- __text_response(text): Reply with plain text when no tool is needed\n\n" +
			"RULES:\n" +
			'- Use "write" to CREATE files (needs path + content). Use "read" to VIEW files.\n' +
			'- For "exec", ONLY provide "command". Do NOT add env, workdir, or other params.\n' +
			'- ONLY use "write" tool when a FILE PATH is specified. For "write a poem/haiku/story", use __text_response.\n\n' +
			"ALWAYS use this EXACT format:\n" +
			'[TOOL_CALL]\n{"name": "TOOL_NAME", "arguments": {"param": "value"}}\n[/TOOL_CALL]\n\n' +
			"Examples:\n" +
			'[TOOL_CALL]\n{"name": "read", "arguments": {"path": "/file.txt"}}\n[/TOOL_CALL]\n\n' +
			'[TOOL_CALL]\n{"name": "write", "arguments": {"path": "/hello.txt", "content": "Hello world"}}\n[/TOOL_CALL]\n\n' +
			'[TOOL_CALL]\n{"name": "exec", "arguments": {"command": "echo hello"}}\n[/TOOL_CALL]\n\n' +
			'[TOOL_CALL]\n{"name": "__text_response", "arguments": {"text": "Here is my answer."}}\n[/TOOL_CALL]';
		if (messages.length > 0 && (messages[0].role === "system" || messages[0].role === "developer")) {
			messages[0].content = compactPrompt;
		}
		delete (params as any).tools;
		delete (params as any).tool_choice;
	}

	if (compat.thinkingFormat === "zai" && model.reasoning) {
		// Z.ai uses binary thinking: { type: "enabled" | "disabled" }
		// Must explicitly disable since z.ai defaults to thinking enabled
		(params as any).thinking = { type: options?.reasoningEffort ? "enabled" : "disabled" };
	} else if (compat.thinkingFormat === "qwen" && model.reasoning) {
		// Qwen uses enable_thinking: boolean
		(params as any).enable_thinking = !!options?.reasoningEffort;
	} else if (options?.reasoningEffort && model.reasoning && compat.supportsReasoningEffort) {
		// OpenAI-style reasoning_effort
		params.reasoning_effort = options.reasoningEffort;
	}

	// OpenRouter provider routing preferences
	if (model.baseUrl.includes("openrouter.ai") && model.compat?.openRouterRouting) {
		(params as any).provider = model.compat.openRouterRouting;
	}

	// Vercel AI Gateway provider routing preferences
	if (model.baseUrl.includes("ai-gateway.vercel.sh") && model.compat?.vercelGatewayRouting) {
		const routing = model.compat.vercelGatewayRouting;
		if (routing.only || routing.order) {
			const gatewayOptions: Record<string, string[]> = {};
			if (routing.only) gatewayOptions.only = routing.only;
			if (routing.order) gatewayOptions.order = routing.order;
			(params as any).providerOptions = { gateway: gatewayOptions };
		}
	}

	return params;
}

function maybeAddOpenRouterAnthropicCacheControl(
	model: Model<"openai-completions">,
	messages: ChatCompletionMessageParam[],
): void {
	if (model.provider !== "openrouter" || !model.id.startsWith("anthropic/")) return;

	// Anthropic-style caching requires cache_control on a text part. Add a breakpoint
	// on the last user/assistant message (walking backwards until we find text content).
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role !== "user" && msg.role !== "assistant") continue;

		const content = msg.content;
		if (typeof content === "string") {
			msg.content = [
				Object.assign({ type: "text" as const, text: content }, { cache_control: { type: "ephemeral" } }),
			];
			return;
		}

		if (!Array.isArray(content)) continue;

		// Find last text part and add cache_control
		for (let j = content.length - 1; j >= 0; j--) {
			const part = content[j];
			if (part?.type === "text") {
				Object.assign(part, { cache_control: { type: "ephemeral" } });
				return;
			}
		}
	}
}

export function convertMessages(
	model: Model<"openai-completions">,
	context: Context,
	compat: Required<OpenAICompletionsCompat>,
): ChatCompletionMessageParam[] {
	const params: ChatCompletionMessageParam[] = [];

	const normalizeToolCallId = (id: string): string => {
		if (compat.requiresMistralToolIds) return normalizeMistralToolId(id);

		// Handle pipe-separated IDs from OpenAI Responses API
		// Format: {call_id}|{id} where {id} can be 400+ chars with special chars (+, /, =)
		// These come from providers like github-copilot, openai-codex, opencode
		// Extract just the call_id part and normalize it
		if (id.includes("|")) {
			const [callId] = id.split("|");
			// Sanitize to allowed chars and truncate to 40 chars (OpenAI limit)
			return callId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
		}

		if (model.provider === "openai") return id.length > 40 ? id.slice(0, 40) : id;
		// Copilot Claude models route to Claude backend which requires Anthropic ID format
		if (model.provider === "github-copilot" && model.id.toLowerCase().includes("claude")) {
			return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
		}
		return id;
	};

	const transformedMessages = transformMessages(context.messages, model, (id) => normalizeToolCallId(id));

	if (context.systemPrompt) {
		const useDeveloperRole = model.reasoning && compat.supportsDeveloperRole;
		const role = useDeveloperRole ? "developer" : "system";
		params.push({ role: role, content: sanitizeSurrogates(context.systemPrompt) });
	}

	// toolsViaPrompt: stateless turns to prevent coherence loss on small models.
	// Phi Silica (3.8B) loses the [TOOL_CALL] format after ~3 turns with history.
	// Stateless approach: only send the current turn's messages (last user message +
	// any tool call/result from the current turn). This gives 8/8 turn accuracy vs
	// 2/8 with full history. Trade-off: no conversation memory between turns.
	let _historyStartIdx = 0;
	if (compat.toolsViaPrompt) {
		// Find the last user message — start from there (includes current tool interaction)
		for (let k = transformedMessages.length - 1; k >= 0; k--) {
			if (transformedMessages[k].role === "user") {
				_historyStartIdx = k;
				break;
			}
		}
	}

	let lastRole: string | null = null;

	for (let i = _historyStartIdx; i < transformedMessages.length; i++) {
		const msg = transformedMessages[i];
		// Some providers (e.g. Mistral/Devstral) don't allow user messages directly after tool results
		// Insert a synthetic assistant message to bridge the gap
		if (compat.requiresAssistantAfterToolResult && lastRole === "toolResult" && msg.role === "user") {
			params.push({
				role: "assistant",
				content: "I have processed the tool results.",
			});
		}

		if (msg.role === "user") {
			// toolsViaPrompt: strip [message_id: ...] suffixes that TUI/gateway appends.
			// The square brackets confuse prompt-based models about what constitutes a marker.
			const _stripMsgId = (text: string): string =>
				compat.toolsViaPrompt ? text.replace(/\n?\[message_id: [^\]]+\]/g, "").trim() : text;

			if (typeof msg.content === "string") {
				params.push({
					role: "user",
					content: _stripMsgId(sanitizeSurrogates(msg.content)),
				});
			} else {
				const content: ChatCompletionContentPart[] = msg.content.map((item): ChatCompletionContentPart => {
					if (item.type === "text") {
						return {
							type: "text",
							text: _stripMsgId(sanitizeSurrogates(item.text)),
						} satisfies ChatCompletionContentPartText;
					} else {
						return {
							type: "image_url",
							image_url: {
								url: `data:${item.mimeType};base64,${item.data}`,
							},
						} satisfies ChatCompletionContentPartImage;
					}
				});
				const filteredContent = !model.input.includes("image")
					? content.filter((c) => c.type !== "image_url")
					: content;
				if (filteredContent.length === 0) continue;
				params.push({
					role: "user",
					content: filteredContent,
				});
			}
		} else if (msg.role === "assistant") {
			// Some providers (e.g. Mistral) don't accept null content, use empty string instead
			const assistantMsg: ChatCompletionAssistantMessageParam = {
				role: "assistant",
				content: compat.requiresAssistantAfterToolResult ? "" : null,
			};

			const textBlocks = msg.content.filter((b) => b.type === "text") as TextContent[];
			// Filter out empty text blocks to avoid API validation errors
			const nonEmptyTextBlocks = textBlocks.filter((b) => b.text && b.text.trim().length > 0);
			if (nonEmptyTextBlocks.length > 0) {
				// GitHub Copilot requires assistant content as a string, not an array.
				// Sending as array causes Claude models to re-answer all previous prompts.
				if (model.provider === "github-copilot") {
					assistantMsg.content = nonEmptyTextBlocks.map((b) => sanitizeSurrogates(b.text)).join("");
				} else {
					assistantMsg.content = nonEmptyTextBlocks.map((b) => {
						return { type: "text", text: sanitizeSurrogates(b.text) };
					});
				}
			}

			// Handle thinking blocks
			const thinkingBlocks = msg.content.filter((b) => b.type === "thinking") as ThinkingContent[];
			// Filter out empty thinking blocks to avoid API validation errors
			const nonEmptyThinkingBlocks = thinkingBlocks.filter((b) => b.thinking && b.thinking.trim().length > 0);
			if (nonEmptyThinkingBlocks.length > 0) {
				if (compat.requiresThinkingAsText) {
					// Convert thinking blocks to plain text (no tags to avoid model mimicking them)
					const thinkingText = nonEmptyThinkingBlocks.map((b) => b.thinking).join("\n\n");
					const textContent = assistantMsg.content as Array<{ type: "text"; text: string }> | null;
					if (textContent) {
						textContent.unshift({ type: "text", text: thinkingText });
					} else {
						assistantMsg.content = [{ type: "text", text: thinkingText }];
					}
				} else {
					// Use the signature from the first thinking block if available (for llama.cpp server + gpt-oss)
					const signature = nonEmptyThinkingBlocks[0].thinkingSignature;
					if (signature && signature.length > 0) {
						(assistantMsg as any)[signature] = nonEmptyThinkingBlocks.map((b) => b.thinking).join("\n");
					}
				}
			}

			const toolCalls = msg.content.filter((b) => b.type === "toolCall") as ToolCall[];
			if (toolCalls.length > 0) {
				if (compat.toolsViaPrompt) {
					// Convert tool calls to text format for prompt-based models
					const tc = toolCalls[0];
					const toolCallText = `[TOOL_CALL]\n${JSON.stringify({ name: tc.name, arguments: tc.arguments })}\n[/TOOL_CALL]`;
					assistantMsg.content = toolCallText;
				} else {
					assistantMsg.tool_calls = toolCalls.map((tc) => ({
						id: tc.id,
						type: "function" as const,
						function: {
							name: tc.name,
							arguments: JSON.stringify(tc.arguments),
						},
					}));
					const reasoningDetails = toolCalls
						.filter((tc) => tc.thoughtSignature)
						.map((tc) => {
							try {
								return JSON.parse(tc.thoughtSignature!);
							} catch {
								return null;
							}
						})
						.filter(Boolean);
					if (reasoningDetails.length > 0) {
						(assistantMsg as any).reasoning_details = reasoningDetails;
					}
				}
			}

			// toolsViaPrompt: wrap plain text assistant responses in [TOOL_CALL] format
			// for conversation history. This ensures the model always sees the expected
			// format in prior turns, preventing format drift where the model stops using
			// [TOOL_CALL] after seeing plain text responses from itself.
			if (compat.toolsViaPrompt && toolCalls.length === 0 && nonEmptyTextBlocks.length > 0) {
				const text = nonEmptyTextBlocks.map((b) => sanitizeSurrogates(b.text)).join("\n");
				assistantMsg.content = `[TOOL_CALL]\n${JSON.stringify({ name: "__text_response", arguments: { text } })}\n[/TOOL_CALL]`;
			}

			// Skip assistant messages that have no content and no tool calls.
			// Mistral explicitly requires "either content or tool_calls, but not none".
			// Other providers also don't accept empty assistant messages.
			// This handles aborted assistant responses that got no content.
			const content = assistantMsg.content;
			const hasContent =
				content !== null &&
				content !== undefined &&
				(typeof content === "string" ? content.length > 0 : content.length > 0);
			if (!hasContent && !assistantMsg.tool_calls) {
				continue;
			}
			params.push(assistantMsg);
		} else if (msg.role === "toolResult") {
			if (compat.toolsViaPrompt) {
				// Convert tool results to user messages for prompt-based models
				let j = i;
				for (; j < transformedMessages.length && transformedMessages[j].role === "toolResult"; j++) {
					const toolMsg = transformedMessages[j] as ToolResultMessage;
					const textResult = toolMsg.content
						.filter((c) => c.type === "text")
						.map((c) => (c as any).text)
						.join("\n");
					params.push({
						role: "user",
						content: sanitizeSurrogates(
							`[TOOL_RESULT]\n${JSON.stringify({ name: toolMsg.toolName, result: textResult })}\n[/TOOL_RESULT]\n\nBased on the tool result, respond using [TOOL_CALL] with __text_response.`,
						),
					});
				}
				i = j - 1;
				lastRole = "user";
				continue;
			}

			const imageBlocks: Array<{ type: "image_url"; image_url: { url: string } }> = [];
			let j = i;

			for (; j < transformedMessages.length && transformedMessages[j].role === "toolResult"; j++) {
				const toolMsg = transformedMessages[j] as ToolResultMessage;

				// Extract text and image content
				const textResult = toolMsg.content
					.filter((c) => c.type === "text")
					.map((c) => (c as any).text)
					.join("\n");
				const hasImages = toolMsg.content.some((c) => c.type === "image");

				// Always send tool result with text (or placeholder if only images)
				const hasText = textResult.length > 0;
				// Some providers (e.g. Mistral) require the 'name' field in tool results
				const toolResultMsg: ChatCompletionToolMessageParam = {
					role: "tool",
					content: sanitizeSurrogates(hasText ? textResult : "(see attached image)"),
					tool_call_id: toolMsg.toolCallId,
				};
				if (compat.requiresToolResultName && toolMsg.toolName) {
					(toolResultMsg as any).name = toolMsg.toolName;
				}
				params.push(toolResultMsg);

				if (hasImages && model.input.includes("image")) {
					for (const block of toolMsg.content) {
						if (block.type === "image") {
							imageBlocks.push({
								type: "image_url",
								image_url: {
									url: `data:${(block as any).mimeType};base64,${(block as any).data}`,
								},
							});
						}
					}
				}
			}

			i = j - 1;

			if (imageBlocks.length > 0) {
				if (compat.requiresAssistantAfterToolResult) {
					params.push({
						role: "assistant",
						content: "I have processed the tool results.",
					});
				}

				params.push({
					role: "user",
					content: [
						{
							type: "text",
							text: "Attached image(s) from tool result:",
						},
						...imageBlocks,
					],
				});
				lastRole = "user";
			} else {
				lastRole = "toolResult";
			}
			continue;
		}

		lastRole = msg.role;
	}

	return params;
}

function convertTools(
	tools: Tool[],
	compat: Required<OpenAICompletionsCompat>,
): OpenAI.Chat.Completions.ChatCompletionTool[] {
	return tools.map((tool) => ({
		type: "function",
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters as any, // TypeBox already generates JSON Schema
			// Only include strict if provider supports it. Some reject unknown fields.
			...(compat.supportsStrictMode !== false && { strict: false }),
		},
	}));
}

function mapStopReason(reason: ChatCompletionChunk.Choice["finish_reason"]): StopReason {
	if (reason === null) return "stop";
	switch (reason) {
		case "stop":
			return "stop";
		case "length":
			return "length";
		case "function_call":
		case "tool_calls":
			return "toolUse";
		case "content_filter":
			return "error";
		default: {
			const _exhaustive: never = reason;
			throw new Error(`Unhandled stop reason: ${_exhaustive}`);
		}
	}
}

/**
 * Detect compatibility settings from provider and baseUrl for known providers.
 * Provider takes precedence over URL-based detection since it's explicitly configured.
 * Returns a fully resolved OpenAICompletionsCompat object with all fields set.
 */
function detectCompat(model: Model<"openai-completions">): Required<OpenAICompletionsCompat> {
	const provider = model.provider;
	const baseUrl = model.baseUrl;

	const isZai = provider === "zai" || baseUrl.includes("api.z.ai");

	const isNonStandard =
		provider === "cerebras" ||
		baseUrl.includes("cerebras.ai") ||
		provider === "xai" ||
		baseUrl.includes("api.x.ai") ||
		provider === "mistral" ||
		baseUrl.includes("mistral.ai") ||
		baseUrl.includes("chutes.ai") ||
		baseUrl.includes("deepseek.com") ||
		isZai ||
		provider === "opencode" ||
		baseUrl.includes("opencode.ai");

	const useMaxTokens = provider === "mistral" || baseUrl.includes("mistral.ai") || baseUrl.includes("chutes.ai");

	const isGrok = provider === "xai" || baseUrl.includes("api.x.ai");

	const isMistral = provider === "mistral" || baseUrl.includes("mistral.ai");

	const isFoundryLocal = baseUrl.includes("localhost:5272");
	const isPhiSilica = isFoundryLocal && model.id.toLowerCase() === "phi-silica";

	return {
		supportsStore: !isNonStandard,
		supportsDeveloperRole: !isNonStandard,
		supportsReasoningEffort: !isGrok && !isZai,
		supportsUsageInStreaming: true,
		maxTokensField: useMaxTokens ? "max_tokens" : "max_completion_tokens",
		requiresToolResultName: isMistral,
		requiresAssistantAfterToolResult: false, // Mistral no longer requires this as of Dec 2024
		requiresThinkingAsText: isMistral,
		requiresMistralToolIds: isMistral,
		thinkingFormat: isZai ? "zai" : "openai",
		openRouterRouting: {},
		vercelGatewayRouting: {},
		supportsStrictMode: true,
		forceToolChoice: isFoundryLocal && !isPhiSilica,
		toolsViaPrompt: isPhiSilica,
	};
}

/**
 * Get resolved compatibility settings for a model.
 * Uses explicit model.compat if provided, otherwise auto-detects from provider/URL.
 */
function getCompat(model: Model<"openai-completions">): Required<OpenAICompletionsCompat> {
	const detected = detectCompat(model);
	if (!model.compat) return detected;

	return {
		supportsStore: model.compat.supportsStore ?? detected.supportsStore,
		supportsDeveloperRole: model.compat.supportsDeveloperRole ?? detected.supportsDeveloperRole,
		supportsReasoningEffort: model.compat.supportsReasoningEffort ?? detected.supportsReasoningEffort,
		supportsUsageInStreaming: model.compat.supportsUsageInStreaming ?? detected.supportsUsageInStreaming,
		maxTokensField: model.compat.maxTokensField ?? detected.maxTokensField,
		requiresToolResultName: model.compat.requiresToolResultName ?? detected.requiresToolResultName,
		requiresAssistantAfterToolResult:
			model.compat.requiresAssistantAfterToolResult ?? detected.requiresAssistantAfterToolResult,
		requiresThinkingAsText: model.compat.requiresThinkingAsText ?? detected.requiresThinkingAsText,
		requiresMistralToolIds: model.compat.requiresMistralToolIds ?? detected.requiresMistralToolIds,
		thinkingFormat: model.compat.thinkingFormat ?? detected.thinkingFormat,
		openRouterRouting: model.compat.openRouterRouting ?? {},
		vercelGatewayRouting: model.compat.vercelGatewayRouting ?? detected.vercelGatewayRouting,
		supportsStrictMode: model.compat.supportsStrictMode ?? detected.supportsStrictMode,
		forceToolChoice: model.compat.forceToolChoice ?? detected.forceToolChoice,
		toolsViaPrompt: model.compat.toolsViaPrompt ?? detected.toolsViaPrompt,
	};
}
