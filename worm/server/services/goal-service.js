const {
  defaultModelFor,
  isProviderConfigured,
  streamHermesChat,
  streamNvidiaChat,
  streamOllamaChat
} = require("./provider-service");
const { runWebLiveLookup } = require("../tools/web-live-tool");
const { runCurrentTimeTool } = require("../tools/time-tool");
const { runServerDiagnostic } = require("../tools/server-tool");
const { runNetworkDiagnostic } = require("../tools/network-tool");

// Simple ID generator
function generateId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Goal statuses
const GOAL_STATUS = {
  PLANNING: "planning",
  EXECUTING: "executing",
  COMPLETED: "completed",
  FAILED: "failed"
};

// Task statuses
const TASK_STATUS = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed"
};

// Max concurrent tasks
const MAX_CONCURRENT_TASKS = 3;

/**
 * Call LLM with structured JSON response
 */
async function callLLMForJSON(systemPrompt, userMessage, provider, model) {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage }
  ];

  const streamResponse = provider === "nvidia"
    ? await streamNvidiaChat({ model, messages, mode: "low" })
    : provider === "hermes"
      ? await streamHermesChat({ model, messages, mode: "low" })
      : await streamOllamaChat({ model, messages, mode: "low" });

  const stream = streamResponse.data;
  const isSse = provider === "nvidia" || provider === "hermes";

  return new Promise((resolve, reject) => {
    let buffer = "";
    let fullText = "";

    const timeout = setTimeout(() => {
      cleanup();
      stream.destroy?.();
      reject(new GoalError("LLM timeout"));
    }, 20000);

    const cleanup = () => {
      clearTimeout(timeout);
      stream.removeAllListeners("data");
      stream.removeAllListeners("end");
      stream.removeAllListeners("error");
    };

    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const parts = isSse ? buffer.split("\n\n") : buffer.split("\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        const line = isSse
          ? part.split("\n").find((entry) => entry.startsWith("data: "))
          : part.trim();
        if (!line) continue;
        const rawLine = isSse ? line.slice(6).trim() : line.trim();
        if (!rawLine || rawLine === "[DONE]") continue;

        try {
          const parsed = JSON.parse(rawLine);
          const token = isSse
            ? parsed?.choices?.[0]?.delta?.content || ""
            : parsed?.message?.content || "";
          if (token) fullText += token;
        } catch {
          // ignore partial lines
        }
      }
    });

    stream.on("end", () => {
      cleanup();
      resolve(fullText.trim());
    });

    stream.on("error", (error) => {
      cleanup();
      reject(error);
    });
  });
}

/**
 * Parse JSON from LLM response, handling markdown code blocks
 */
function parseJSONfromLLM(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try { return JSON.parse(match[1].trim()); } catch {}
    }
    const objectMatch = raw.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try { return JSON.parse(objectMatch[0]); } catch {}
    }
    return null;
  }
}

/**
 * Custom error class for goal-related errors
 */
class GoalError extends Error {
  constructor(message, taskId = null) {
    super(message);
    this.name = "GoalError";
    this.taskId = taskId;
  }
}

/**
 * Detect if a message needs goal-based execution
 * Returns { isGoal, reason, estimatedTasks }
 */
async function detectGoalIntent(message, options = {}) {
  const provider = String(options.provider || "ollama").trim().toLowerCase();
  const model = String(options.model || defaultModelFor(provider)).trim();

  if (!isProviderConfigured(provider)) {
    return { isGoal: false, reason: "Provider not configured", estimatedTasks: 0 };
  }

  const systemPrompt = `You are a task complexity analyzer. Determine if the user's request requires multi-step goal-based execution.

Return exactly this JSON:
{
  "isGoal": true/false,
  "reason": "brief explanation",
  "estimatedTasks": number
}

## When isGoal = true
- Request requires 3+ independent research/investigation steps
- Request asks to "compare", "analyze", "research" multiple items
- Request needs data gathering from multiple sources before synthesis
- Request involves monitoring or tracking multiple things
- Examples:
  - "Research top 5 crypto exchanges and compare fees" → true (5 research + 1 synthesis)
  - "Analyze server performance and network health" → true (2 diagnostics + 1 synthesis)
  - "What's the price of Bitcoin?" → false (single lookup)
  - "Tell me a joke" → false (no multi-step needed)
  - "Ping google.com" → false (single action)

## When isGoal = false
- Simple question answerable in one step
- Single tool call (one search, one ping, one price check)
- Conversational/chat messages
- Creative writing requests
- Opinion questions

Be conservative: only set isGoal=true when the request CLEARLY needs multiple steps.`;

  try {
    const raw = await callLLMForJSON(systemPrompt, message, provider, model);
    const parsed = parseJSONfromLLM(raw);

    if (!parsed || typeof parsed.isGoal !== "boolean") {
      return { isGoal: false, reason: "Could not parse intent", estimatedTasks: 0 };
    }

    return {
      isGoal: parsed.isGoal,
      reason: String(parsed.reason || ""),
      estimatedTasks: Math.max(1, Math.min(10, Number(parsed.estimatedTasks || 1)))
    };
  } catch (error) {
    console.warn(`[goal] Intent detection failed: ${error.message}`);
    return { isGoal: false, reason: "Detection failed", estimatedTasks: 0 };
  }
}

/**
 * Plan goal tasks by decomposing the request
 * Returns goal object with tasks array
 */
async function planGoalTasks(message, options = {}) {
  const provider = String(options.provider || "ollama").trim().toLowerCase();
  const model = String(options.model || defaultModelFor(provider)).trim();

  const systemPrompt = `You are a task planner. Break down the user's request into specific, executable tasks.

Return exactly this JSON:
{
  "description": "brief goal description",
  "tasks": [
    {
      "id": "task_1",
      "description": "what this task does",
      "tool": "web.live|time.now|server.status|network.check|synthesis",
      "query": "search query or action description",
      "dependencies": []
    }
  ]
}

## Tool Selection Guide
- web.live: Search for current information, prices, news, facts
- time.now: Get current time/date
- server.status: Check server metrics (CPU, RAM, disk)
- network.check: Network diagnostics (ping, DNS, traceroute)
- synthesis: Combine results from other tasks (always last)

## Rules
- Each task should be atomic and focused
- Tasks with no dependencies run in parallel
- synthesis task always depends on all research tasks
- Use "web.live" for data gathering, "synthesis" for combining
- Keep queries specific and searchable
- Maximum 7 tasks (including synthesis)
- synthesis task is ALWAYS required as the last task`;

  try {
    const raw = await callLLMForJSON(systemPrompt, message, provider, model);
    const parsed = parseJSONfromLLM(raw);

    if (!parsed || !Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
      throw new GoalError("Invalid task plan");
    }

    // Validate and normalize tasks
    const validTools = ["web.live", "time.now", "server.status", "network.check", "synthesis"];
    const tasks = parsed.tasks.map((task, index) => ({
      id: task.id || `task_${index + 1}`,
      description: String(task.description || ""),
      tool: validTools.includes(task.tool) ? task.tool : "web.live",
      query: String(task.query || task.description || ""),
      dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
      status: TASK_STATUS.PENDING,
      output: null,
      error: null,
      startedAt: null,
      completedAt: null
    }));

    // Ensure synthesis task exists
    const hasSynthesis = tasks.some((t) => t.tool === "synthesis");
    if (!hasSynthesis) {
      const researchTaskIds = tasks.filter((t) => t.tool !== "synthesis").map((t) => t.id);
      tasks.push({
        id: `task_${tasks.length + 1}`,
        description: "Synthesize all results into a comprehensive answer",
        tool: "synthesis",
        query: message,
        dependencies: researchTaskIds,
        status: TASK_STATUS.PENDING,
        output: null,
        error: null,
        startedAt: null,
        completedAt: null
      });
    }

    return {
      id: generateId("goal"),
      description: String(parsed.description || message),
      status: GOAL_STATUS.PLANNING,
      tasks,
      result: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.warn(`[goal] Task planning failed: ${error.message}`);
    throw new GoalError("Failed to plan tasks: " + error.message);
  }
}

/**
 * Execute a single task
 */
async function executeSingleTask(task, goalDescription) {
  const startTime = Date.now();
  task.status = TASK_STATUS.RUNNING;
  task.startedAt = new Date().toISOString();

  try {
    let result;

    switch (task.tool) {
      case "web.live":
        result = await runWebLiveLookup(task.query, {
          secondHop: true,
          synthesisOnly: false,
          forceLookup: true
        });
        task.output = {
          summary: result?.summary || "No results",
          contextText: result?.contextText || "",
          directReply: result?.directReply || "",
          score: result?.engine?.score || 0
        };
        break;

      case "time.now":
        result = runCurrentTimeTool(task.query);
        task.output = {
          summary: result?.summary || "Time query",
          directReply: result?.directReply || ""
        };
        break;

      case "server.status":
        result = await runServerDiagnostic(task.query);
        task.output = {
          summary: result?.summary || "Server status",
          directReply: result?.directReply || ""
        };
        break;

      case "network.check":
        result = await runNetworkDiagnostic(task.query);
        task.output = {
          summary: result?.summary || "Network check",
          directReply: result?.directReply || ""
        };
        break;

      case "synthesis":
        // Synthesis is handled by the caller (chat-service)
        task.output = { summary: "Synthesis pending", needsLLM: true };
        break;

      default:
        throw new GoalError(`Unknown tool: ${task.tool}`, task.id);
    }

    task.status = TASK_STATUS.COMPLETED;
    task.completedAt = new Date().toISOString();
    console.log(`[goal] Task ${task.id} completed in ${Date.now() - startTime}ms`);

  } catch (error) {
    task.status = TASK_STATUS.FAILED;
    task.error = error.message;
    task.completedAt = new Date().toISOString();
    console.warn(`[goal] Task ${task.id} failed: ${error.message}`);
  }

  return task;
}

/**
 * Execute goal tasks respecting dependencies
 * Calls progressCallback(task, eventType) on each state change
 */
async function executeGoal(goal, options = {}, progressCallback = null) {
  goal.status = GOAL_STATUS.EXECUTING;
  goal.updatedAt = new Date().toISOString();

  const completedTasks = new Set();
  const failedTasks = new Set();

  // Get tasks ready to execute (no pending dependencies)
  function getReadyTasks() {
    return goal.tasks.filter((task) => {
      if (task.status !== TASK_STATUS.PENDING) return false;
      return task.dependencies.every((depId) => completedTasks.has(depId));
    });
  }

  // Execute tasks in waves
  let maxIterations = 20; // Safety limit
  while (maxIterations-- > 0) {
    const readyTasks = getReadyTasks();
    if (readyTasks.length === 0) break;

    // Limit concurrency
    const batch = readyTasks.slice(0, MAX_CONCURRENT_TASKS);

    // Notify progress
    if (progressCallback) {
      batch.forEach((task) => progressCallback(task, "start"));
    }

    // Execute batch in parallel
    const results = await Promise.allSettled(
      batch.map((task) => executeSingleTask(task, goal.description))
    );

    // Process results
    results.forEach((result, index) => {
      const task = batch[index];
      if (result.status === "fulfilled") {
        completedTasks.add(task.id);
        if (progressCallback) progressCallback(task, task.status === TASK_STATUS.COMPLETED ? "complete" : "error");
      } else {
        failedTasks.add(task.id);
        task.status = TASK_STATUS.FAILED;
        task.error = result.reason?.message || "Unknown error";
        if (progressCallback) progressCallback(task, "error");
      }
    });
  }

  // Check goal completion
  const allCompleted = goal.tasks.every((t) =>
    t.status === TASK_STATUS.COMPLETED || t.status === TASK_STATUS.FAILED
  );

  goal.status = allCompleted ? GOAL_STATUS.COMPLETED : GOAL_STATUS.FAILED;
  goal.updatedAt = new Date().toISOString();

  return goal;
}

/**
 * Synthesize goal results into final answer
 * Returns the synthesis prompt for the LLM
 */
function buildSynthesisPrompt(goal) {
  const taskResults = goal.tasks
    .filter((t) => t.status === TASK_STATUS.COMPLETED && t.tool !== "synthesis")
    .map((t) => {
      const output = t.output || {};
      return `### ${t.description}\n${output.summary || ""}\n${output.directReply || ""}${output.contextText ? "\n" + output.contextText : ""}`;
    })
    .join("\n\n");

  const failedTasks = goal.tasks
    .filter((t) => t.status === TASK_STATUS.FAILED)
    .map((t) => `- ${t.description}: ${t.error}`)
    .join("\n");

  return {
    systemPrompt: `You are a research synthesizer. Combine the following task results into a comprehensive, well-structured answer for the user.

Original goal: ${goal.description}

Guidelines:
- Present information clearly and concisely
- Compare and contrast when applicable
- Highlight key findings and insights
- Note any data limitations or failed tasks
- Use markdown formatting for readability
- For comparison queries: use markdown tables with columns for each attribute being compared
- Include specific numbers, dates, and sources — never say "data tidak spesifik" if any data point is available in the results
- If exact data is not found for an entity, state what IS known and note the gap explicitly
- Normalize units (all USD, all EUR, etc.) for fair comparison
- Rank or sort by the primary metric when applicable
- NEVER ask the user "do you want me to search again?" — just provide what you found or state what's missing
- NEVER apologize for search quality — just present the best available data`,
    taskResults,
    failedTasks,
    userQuery: goal.description
  };
}

/**
 * Calculate goal progress percentage
 */
function getGoalProgress(goal) {
  if (!goal || !goal.tasks || goal.tasks.length === 0) return 0;
  const completed = goal.tasks.filter((t) =>
    t.status === TASK_STATUS.COMPLETED || t.status === TASK_STATUS.FAILED
  ).length;
  return Math.round((completed / goal.tasks.length) * 100);
}

module.exports = {
  GOAL_STATUS,
  TASK_STATUS,
  GoalError,
  detectGoalIntent,
  planGoalTasks,
  executeGoal,
  buildSynthesisPrompt,
  getGoalProgress,
  generateId
};
