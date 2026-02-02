# Moltbot on Your Copilot+ PC: A Beginner's Cookbook

*No coding experience required. Just a Copilot+ PC and 30-45 minutes.*

---

## 1. What is Moltbot? (And why you should be excited AND careful)

**[OpenClaw](https://en.wikipedia.org/wiki/OpenClaw)** (formerly Moltbot, formerly
Clawdbot) is an open-source AI personal assistant that runs locally on your
computer. It was created by Austrian software engineer Peter Steinberger and released
in late 2025. Within days, it became one of the fastest-growing open-source projects
in GitHub history, surpassing 100,000 stars in its first two months.

The key difference between Moltbot and a chatbot like ChatGPT or Copilot:
**a chatbot *tells* you things -- Moltbot *does* things.** It can read your files,
write documents, run commands, install software, manage your calendar, and take
autonomous actions across your apps. Scientific American described it as
["AI with hands"](https://www.scientificamerican.com/article/moltbot-is-an-open-source-ai-agent-that-runs-your-computer/)
that "follows almost any order" -- when given an objective, it "will break the
objective into steps, find tools, install them, troubleshoot them and attempt to
solve any obstacles."

**Press coverage:**

- **Scientific American:** ["Moltbot Is an Open-Source AI Agent That Runs Your Computer"](https://www.scientificamerican.com/article/moltbot-is-an-open-source-ai-agent-that-runs-your-computer/)
  -- Called it "AI with hands" that can download, install, and run software
  autonomously. Noted it gives AI the ability to "run commands and manipulate files"
  while remembering user preferences.

- **Wired:** ["The Viral AI Assistant Everyone's Talking About"](https://www.wired.com/story/clawdbot-moltbot-viral-ai-assistant/)
  -- Covered the explosive growth and community momentum. AI researcher Andrej
  Karpathy praised it publicly; investor Chamath Palihapitiya said Moltbot helped
  him save 15% on car insurance in minutes.

- **Platformer:** ["Maybe someday you'll have a genie in your laptop. Today is not that day."](https://www.platformer.news/moltbot-clawdbot-review-ai-agent/)
  -- A more skeptical review. Casey Newton found a gap between the hype (YouTube
  creators promising "24/7 AI employees") and reality. Her attempt to build a
  personalized morning briefing ultimately failed, leading her to uninstall it.
  An important reminder that this technology is still early.

**The name:** Originally "Clawdbot," Anthropic asked for a rename over trademark
concerns with Claude. It became "Moltbot" (a nod to how lobsters molt their shells
to grow), then "OpenClaw" in early 2026.
([Read more on Wikipedia](https://en.wikipedia.org/wiki/OpenClaw))

**And here's the cool part:** we're going to run it entirely on your laptop's AI
chip. No cloud. No subscription. No data leaving your device. Ever.

---

### BE CAREFUL -- This is powerful!

**Moltbot is a REAL agent that can ACTUALLY modify your files and run commands on
your computer.** It's like giving someone the keys to your house. Security
researchers -- including teams at Palo Alto Networks -- have warned that AI agents
like this can "expose sensitive information and bypass security boundaries."

Things to know before you start:

- The AI running on your laptop is small (3.8 billion parameters -- for comparison,
  ChatGPT uses models 100x larger). **It WILL make mistakes sometimes.**
- **NEVER point it at important files** until you're comfortable with how it works.
- **Start in a safe test folder.** We'll set one up for you.
- If you tell it to delete something, **it will try to delete it.**
- Even Platformer's Casey Newton -- a seasoned tech journalist -- found the
  technology wasn't ready for complex real-world tasks yet. **Manage your
  expectations.** This is a proof of concept, not a finished product.
- Each action takes about 12 seconds. Be patient.

**Power + responsibility.** Start small, build confidence, then explore.

---

## 2. The brain behind the agent (and why "local" changes everything)

Here's something important to understand: **Moltbot isn't an AI model itself. It's
the hands and feet -- the part that takes action.** It needs a separate AI model as
its "brain" to decide what to do.

Think of it like a car: Moltbot is the steering wheel, pedals, and wheels. The AI
model is the driver. You get to choose the driver.

### The cloud option: world-class AI, but your data leaves the building

Moltbot is designed to work with many AI backends:

| AI Model | Company | What you get |
|---|---|---|
| **Claude Opus 4.5** | Anthropic | One of the most capable AI models available today |
| **GPT-4o / GPT-4.5** | OpenAI | The model behind ChatGPT |
| **Gemini 2.5 Pro** | Google | Google's frontier model |
| **Grok** | xAI | Elon Musk's AI company |
| ...and dozens more | Various | Via OpenRouter, you can access 200+ models |

When you pair Moltbot with a frontier model like Claude Opus 4.5, the results can
be remarkable. These models have hundreds of billions of parameters, trained on
enormous datasets. They can reason through complex multi-step problems, write
sophisticated code, and handle nuanced instructions with high reliability.

**But there's a trade-off.**

When Moltbot uses a cloud AI, every message you send -- including the contents of
your files, your commands, your personal data -- travels over the internet to that
company's servers. The AI reads it, processes it, and sends a response back.

That means:

- **Your data is on someone else's servers.** Even if companies promise not to
  misuse it, the data still physically leaves your device.
- **You're paying per use.** API costs add up -- heavy use of Claude Opus 4.5 can
  cost $50-100+/month easily.
- **You need an internet connection.** No wifi, no AI.
- **You're subject to rate limits.** Use too much too fast and you'll get throttled
  or cut off.
- **Privacy policies can change.** What's private today might be training data
  tomorrow.

For many tasks -- writing code, brainstorming, general research -- this is perfectly
fine. But there are scenarios where sending data to the cloud is a non-starter.

### The local option: your AI, your data, your rules

Now imagine the same AI agent, but the "brain" runs entirely on a chip inside your
laptop. That's what we're doing with **Phi Silica on your Copilot+ PC's NPU**.

**What is Phi Silica?** It's a 3.8 billion parameter AI model made by Microsoft,
specifically optimized to run on the Neural Processing Unit (NPU) inside Copilot+
PCs. It's the same model that powers Windows features like Recall, Click to Do, and
Live Translation. It's already on your device -- you just need to activate it.

**What's an NPU?** It's a dedicated AI chip, separate from your CPU and GPU.
It's designed to run AI workloads efficiently and with low power consumption. Think
of it as a lane on the highway reserved just for AI -- it doesn't slow down
everything else on your computer.

Here's the comparison:

| | Cloud AI (e.g. Claude Opus) | Local AI (Phi Silica on NPU) |
|---|---|---|
| **Intelligence** | Exceptional (hundreds of billions of parameters) | Good for structured tasks (3.8B parameters) |
| **Speed** | 2-5 seconds per response | ~12 seconds per response |
| **Privacy** | Data sent to company servers | Data never leaves your device |
| **Cost** | $0.01-0.10+ per request | $0, forever |
| **Internet required** | Yes | No |
| **Multi-step reasoning** | Excellent | Limited (stateless -- each turn is independent) |
| **Tool selection** | Handles 20+ tools reliably | 4 tools max (read, write, edit, exec) |
| **Best for** | Complex tasks, coding, analysis | File management, simple automation, demos |

### Why local matters for personal data

Consider what an AI agent might touch on your computer:

- **Financial documents** -- tax returns, bank statements, budgets
- **Medical records** -- prescriptions, lab results, insurance claims
- **Legal documents** -- contracts, NDAs, court filings
- **Personal communications** -- emails, messages, notes
- **Business data** -- client lists, proposals, internal memos
- **Photos and personal files** -- things meant only for you

With a cloud model, all of that data passes through someone else's infrastructure.
With Phi Silica running locally, **none of it ever leaves your machine.** Not one
byte. Not one packet. The AI processes everything right on the chip inside your
laptop.

This isn't just a nice-to-have. For some people and industries, it's the difference
between "we can use AI" and "we absolutely cannot use AI":

- **Healthcare workers** handling patient data (HIPAA)
- **Lawyers** with attorney-client privileged materials
- **Financial advisors** with client portfolios
- **Government employees** with classified or sensitive information
- **Anyone** who simply doesn't want their personal files on someone else's server

### The honest trade-off

Local AI on a 3.8B model is not a replacement for Claude Opus or GPT-4. It's
smaller, slower, and less capable at complex reasoning. It can't hold a conversation
across turns (our implementation uses stateless mode for reliability). It sometimes
picks the wrong tool or hallucinates parameters.

**But it can reliably read files, write files, run commands, and edit documents --
entirely offline, entirely private, at zero cost.** For many practical tasks, that's
exactly what you need.

And this is just the beginning. As NPU hardware improves and local models get
larger and smarter, the gap will shrink. Today's 3.8B model on a laptop NPU is a
proof of concept. Tomorrow's 7B, 13B, or larger models on next-generation NPUs
could rival cloud models for many everyday tasks -- while keeping your data exactly
where it belongs: on your device.

---

## 3. What's cool about running it on YOUR Copilot+ PC?

Your Copilot+ PC has a special chip called an **NPU** (Neural Processing Unit).
It's the same chip that powers Windows AI features you might already use:

- **Recall** (searching your PC history)
- **Click to Do** (smart actions on screen)
- **Live Translation**

We're using that **same AI chip** to run Moltbot. Here's why that matters:

| Benefit | What it means for you |
|---|---|
| **Total privacy** | Your data NEVER leaves your device. Not one byte. |
| **Zero cost** | No subscription, no API fees, no token counting. Run it forever. |
| **Works offline** | On a plane, no wifi, in a coffee shop -- doesn't matter. |
| **Already installed** | Phi Silica (the AI model) is already on your Copilot+ PC. |

**It's YOUR AI on YOUR hardware.**

---

## 4. What can it do? (Simple examples)

Once set up, you'll type commands like:

> "Read my notes.txt file and tell me what's in it"

> "Create a new file called shopping-list.txt with milk, eggs, and bread"

> "What time is it?" *(runs a system command to find out)*

> "Edit my file and change 'Monday' to 'Tuesday'"

Each action takes about **12 seconds** on the NPU. That's the AI thinking -- be
patient with it!

---

## 5. What do I need?

**Checklist before you start:**

- [ ] A **Copilot+ PC** (Surface Laptop 7 Intel, Surface Pro 11, ASUS, Dell, HP,
  Lenovo, Samsung -- any Copilot+ PC)
- [ ] **Windows 11** version 24H2 or later
- [ ] About **30-45 minutes** of time
- [ ] Willingness to **copy and paste** some commands

**A note on devices:** This guide is tested on **Intel Lunar Lake** (Surface Laptop
7). Qualcomm Snapdragon X support is coming next -- we started with Intel simply
because that's the device we had open when we started this project! No favorites
here.

**Yes, you'll need to install a few things.** Don't worry -- it's all just clicking
"Next" a few times and copy-pasting commands. No actual coding required.

---

## 6. Let's set it up!

### Step 6.1: Install VS Code

**What it is:** A free text editor from Microsoft. We need it to activate the AI on
your device.

1. Go to **https://code.visualstudio.com/**
2. Click **"Download for Windows"**
3. Run the installer
4. Accept all defaults -- click **Next** until it's done
5. Open VS Code when finished

> **Checkpoint:** You see VS Code open with a Welcome tab.

---

### Step 6.2: Install the AI Toolkit extension

**What it is:** A VS Code add-on that manages AI models on your device.

1. In VS Code, click the **Extensions icon** on the left sidebar (looks like 4
   squares)
2. In the search box, type: **AI Toolkit**
3. Find **"AI Toolkit"** by Microsoft (has a blue icon)
4. Click **Install**
5. Wait for it to finish

> **Checkpoint:** A new AI Toolkit icon appears in the left sidebar (looks like a
> sparkle/star).

---

### Step 6.3: Load Phi Silica from Windows AI API

**This is the key step -- we're activating the AI that's already on your device!**

1. Click the **AI Toolkit icon** in the left sidebar
2. Click on **"Model Catalog"**
3. You'll see tabs at the top: **Foundry Local | Ollama | Windows AI API**
4. Click on the **"Windows AI API"** tab
5. Find **"Phi Silica"** in the list
6. Click **"Add"** to load it
7. Wait for it to initialize (you might see a loading indicator)

> **Checkpoint:** Phi Silica appears in your "My Models" or loaded models section.

---

### Step 6.4: Test Phi Silica in VS Code

**Before we go further, let's make sure your NPU AI is actually running.**

1. In AI Toolkit, click on **Phi Silica**
2. Click **"Try in Playground"** or **"Open Playground"**
3. Type a simple message: **"Hello, what can you do?"**
4. Wait 10-15 seconds for a response

> **Checkpoint:** You get a response! Your NPU is working.
>
> **If this doesn't work, STOP here.** There's no point continuing until the AI
> model responds in the playground. Check that your Windows is up to date (24H2+)
> and that your device is a Copilot+ PC.

---

### Step 6.5: Install Node.js

**What it is:** The engine that runs Moltbot. Think of it like how you need a DVD
player to play a DVD -- Moltbot needs Node.js to run.

1. Go to **https://nodejs.org/**
2. Click the big green **LTS** button (LTS means "stable version")
3. Run the installer
4. Click **Next**, accept the license, **Next**, **Next**, **Install**
5. If you see a checkbox saying **"Automatically install necessary tools"** -- check it
6. Click **Finish**

**IMPORTANT: Close ALL PowerShell or Command Prompt windows you have open, then
reopen them.** Node.js needs a fresh window to be recognized.

> **Checkpoint:** Open PowerShell (press the Windows key, type **PowerShell**, click
> it) and type:
>
> ```
> node --version
> ```
>
> You should see something like `v24.13.0`. If you see "not recognized", close
> PowerShell completely and reopen it.

---

### Step 6.6: Allow PowerShell scripts

PowerShell blocks scripts by default for security. We need to relax that slightly.

Copy and paste this into PowerShell:

```
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

When asked, type **A** (for "Yes to All") and press Enter.

---

### Step 6.7: Install OpenClaw (Moltbot)

Copy and paste this into PowerShell:

```
npm install -g openclaw
```

Wait for it to finish (1-2 minutes). You'll see a lot of text scrolling by --
that's normal.

> **Checkpoint:** You see "added X packages" at the end with no red error messages.

---

### Step 6.8: Get the NPU patch from GitHub

**What this does:** Downloads the code that teaches OpenClaw how to use your NPU.

Copy and paste these commands **one at a time**, pressing Enter after each:

```
cd $HOME
```

```
git clone https://github.com/frankcx1/pi-mono.git pi-mono-npu
```

```
cd pi-mono-npu
```

```
git checkout foundry-local-npu-support
```

**If you see "git is not recognized":**
1. Go to **https://git-scm.com/downloads/win**
2. Download and install (accept all defaults)
3. **Close and reopen PowerShell**
4. Try the commands above again

> **Checkpoint:** The last command says "Switched to branch
> 'foundry-local-npu-support'" or "Already on 'foundry-local-npu-support'".

---

### Step 6.9: Build the NPU patch

**What this does:** Compiles the source code into something OpenClaw can use. Think
of it like converting a recipe into an actual dish.

Copy and paste these commands one at a time:

```
npm install
```

This downloads the ingredients (takes 2-5 minutes, lots of text is normal).

```
npm run build
```

This does the actual cooking (1-2 minutes).

> **Checkpoint:** No red error messages. The last few lines mention packages
> building successfully.

---

### Step 6.10: Apply the NPU patch to OpenClaw

**What this does:** Copies the NPU-aware code into your OpenClaw installation.

Copy and paste this entire command (it's one long line):

```
Copy-Item -Path ".\packages\ai\dist\providers\openai-completions.js" -Destination "$env:APPDATA\npm\node_modules\openclaw\node_modules\@mariozechner\pi-ai\dist\providers\openai-completions.js" -Force
```

> **Checkpoint:** No output means success! (In PowerShell, silence is golden.)

---

### Step 6.11: Set up OpenClaw

Copy and paste this into PowerShell:

```
npx openclaw setup
```

Follow any prompts. When asked about API keys, you can skip them -- we're running
locally!

---

### Step 6.12: Create the Foundry Local configuration

We need to tell OpenClaw to use Phi Silica on your NPU. Copy and paste this entire
block:

```
$configDir = "$env:USERPROFILE\.openclaw"
if (!(Test-Path $configDir)) { New-Item -ItemType Directory -Path $configDir -Force }

@'
{
  "models": {
    "providers": {
      "foundry-local": {
        "baseUrl": "http://localhost:5272/v1",
        "apiKey": "not-needed",
        "api": "openai-completions",
        "models": [{ "id": "phi-silica", "name": "Phi Silica (NPU)" }]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": { "primary": "foundry-local/phi-silica" }
    }
  }
}
'@ | Out-File -FilePath "$configDir\openclaw.json" -Encoding UTF8
```

> **Checkpoint:** No errors. You can verify by running:
> ```
> Get-Content "$env:USERPROFILE\.openclaw\openclaw.json"
> ```
> You should see the JSON configuration we just wrote.

---

### Step 6.13: Create a safe test folder

Before we start, let's make a safe place to experiment where you won't accidentally
touch important files:

```
$testDir = "$env:USERPROFILE\.openclaw\workspace"
if (!(Test-Path $testDir)) { New-Item -ItemType Directory -Path $testDir -Force }
"Hello from my Copilot+ PC!" | Out-File -FilePath "$testDir\hello.txt" -Encoding UTF8
```

---

### Step 6.14: Start chatting!

**Make sure Phi Silica is loaded in AI Toolkit** (Step 6.3-6.4). Then run:

```
npx openclaw agent --local --session-id my-first-test --message "read $env:USERPROFILE\.openclaw\workspace\hello.txt"
```

Wait about 12 seconds...

**You should see the AI read your file and tell you what's in it!**

---

## 7. Try these commands!

Now that it's working, try these one at a time. Each takes about 12 seconds.

**Say hello:**

```
npx openclaw agent --local --session-id test --message "hello, what can you help me with?"
```

**Create a file:**

```
npx openclaw agent --local --session-id test --message "use the write tool to create a file at C:\Users\$env:USERNAME\.openclaw\workspace\shopping.txt with content: milk, eggs, bread, butter"
```

**Read it back:**

```
npx openclaw agent --local --session-id test --message "read C:\Users\$env:USERNAME\.openclaw\workspace\shopping.txt"
```

**Run a command:**

```
npx openclaw agent --local --session-id test --message "run the command: powershell -c Get-Date"
```

**Write a haiku:**

```
npx openclaw agent --local --session-id test --message "write a haiku about computers"
```

---

## 8. Troubleshooting (in plain English)

**"'node' is not recognized"**
Close PowerShell completely, reopen it, try again. Node.js needs a fresh window
after installation.

**"'git' is not recognized"**
Install Git from https://git-scm.com/downloads/win, then close and reopen
PowerShell.

**"npm ERR!" with red text during install**
Try running PowerShell as Administrator (right-click PowerShell, "Run as
administrator") and try the npm install command again.

**No output or blank responses**
Make sure Phi Silica is loaded in AI Toolkit. Go back to Step 6.4 and verify it
responds in the playground.

**Takes more than 30 seconds with no response**
The AI might have unloaded from memory. Open AI Toolkit in VS Code, click on
Phi Silica, make sure it's active. Try again.

**"file not found" errors**
Check your username in the path. Open File Explorer and go to `C:\Users\` to see
your exact username. It's case-sensitive!

**"npm run build" fails with errors**
Make sure you ran `npm install` first and it completed without errors. If it still
fails, try deleting the `node_modules` folder and running `npm install` again:
```
Remove-Item -Recurse -Force node_modules
npm install
npm run build
```

---

## 9. Stuck? Ask AI for help!

If you get stuck at any point, copy this into **Microsoft Copilot**, **Claude**, or
**ChatGPT**:

---

*Copy this entire block:*

```
I'm following a beginner's guide to set up Moltbot/OpenClaw on my Copilot+ PC
with Phi Silica NPU.

My setup:
- Device: [Surface Laptop 7 / Surface Pro 11 / other - fill in yours]
- Windows version: [run 'winver' to check]
- Current step I'm stuck on: [describe which step number]

The error or problem I'm seeing:
[paste any error message here]

What I've tried:
[describe what you attempted]

Can you help me troubleshoot this specific issue?
```

---

**Pro tip:** Screenshots help! Press **Win + Shift + S** to capture your screen, then
paste it right into the AI chat.

The AI assistants are great at debugging setup issues -- that's literally how this
whole project was built!

---

## 10. What's next?

- **Share what you built!** Tag **#Moltbot #CopilotPlus #LocalAI** on social media
- **Follow the project:** https://github.com/badlogic/pi-mono
- **Snapdragon X** support coming soon!
- The more people try this, the better it gets

---

## 11. The story behind this

This started as a weekend experiment -- "I wonder if I could get an AI agent running
entirely on my Surface Laptop's NPU?" A few hours of vibe coding with Claude Code
later, it actually worked.

The whole project was built in one session -- from "is this even possible?" to
working code with documentation. If a random person with a laptop can do this,
imagine what the community can build together.

If you try this and build something cool, share it! That's how open source works.
