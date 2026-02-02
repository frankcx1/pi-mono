# LinkedIn Post

---

**What if your AI agent never sent a single byte of your data to the cloud?**

You've probably seen Moltbot in the news. Scientific American called it "AI with hands" -- an open-source agent that "follows almost any order," breaking objectives into steps, finding tools, installing them, and troubleshooting on its own. Wired covered its explosive growth. Andrej Karpathy praised it publicly. It surpassed 100,000 GitHub stars in its first two months.

But here's the thing about Moltbot (now called OpenClaw): it's designed to work with cloud AI models like Claude Opus, GPT-4, and Gemini. World-class intelligence -- but every file it reads, every command it runs, every piece of your data travels to someone else's servers.

Think about what an AI agent touches on your computer: tax returns, medical records, client contracts, internal memos, personal photos. For a healthcare worker under HIPAA, a lawyer with privileged materials, a government employee with sensitive information, or anyone who simply values their privacy -- sending that data to the cloud is a non-starter.

**So I ran Moltbot entirely on a laptop NPU. No cloud. No API keys. No data leaving the device. Ever.**

I patched OpenClaw to use Phi Silica -- Microsoft's 3.8B parameter model that runs on the Neural Processing Unit inside every Copilot+ PC. Same chip that powers Recall, Click to Do, and Live Translation. Already on your device, just waiting for workloads.

The result: an AI agent that reads files, writes documents, executes commands, and edits code -- all on-device. 8 out of 8 test turns passing. ~12 seconds per tool call. Zero dollars in API costs. Works on a plane, in a SCIF, in a hospital.

**The technical challenge was real.** Phi Silica has no built-in tool-calling support -- Foundry Local strips all tool parameters from API requests. I built a prompt-engineering shim that injects tool definitions into the system prompt, parses structured markers from the model's output, and validates arguments against the actual tool schema.

The key insight: a 3.8B model can't track conversation history and tool-calling format simultaneously. With history, reliability was 2/8. Remove history entirely -- stateless turns -- and it jumps to 8/8.

**Honest trade-offs:** This is a proof of concept, not a replacement for frontier models. The 3.8B model has no cross-turn memory, handles only 4 tools, and occasionally picks the wrong one. Platformer's Casey Newton reminded us that AI agents are still early technology. But for file management, simple automation, and private document handling -- entirely offline, entirely private, at zero cost -- it works today.

And this is just the beginning. As NPU hardware improves and local models get larger, the gap with cloud models will shrink. Today's 3.8B proof of concept on a laptop NPU points toward tomorrow's 7B and 13B models on next-generation hardware.

**Want to try it yourself?** I wrote a step-by-step beginner's guide -- no coding experience required, just a Copilot+ PC and 30-45 minutes:
https://github.com/frankcx1/pi-mono/blob/foundry-local-npu-support/BEGINNERS_COOKBOOK.md

PR submitted to the open-source project:
https://github.com/badlogic/pi-mono/compare/main...frankcx1:pi-mono:foundry-local-npu-support

If you're building on Copilot+ PCs, Foundry Local, or local AI agents, I'd love to compare notes.

#AI #EdgeAI #CopilotPlus #Surface #LocalAI #OpenSource #NPU #FoundryLocal #IntelLunarLake #Moltbot #DataPrivacy #OnDeviceAI

---

*Suggested image: Screenshot of the terminal showing a successful tool call with the ~12s latency visible, running on a Surface device.*
