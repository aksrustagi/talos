/**
 * A2A (Agent-to-Agent) Protocol Integration
 *
 * Implements the A2A protocol (https://github.com/a2aproject/A2A) for
 * inter-agent communication. Enables Talos agents to:
 * - Publish Agent Cards for discovery
 * - Accept tasks from external agents
 * - Delegate tasks to external agents
 * - Support streaming, push notifications, and multi-turn conversations
 *
 * Protocol: JSON-RPC 2.0 over HTTPS
 * Discovery: /.well-known/agent.json
 */

import { Hono } from "hono";

// ============================================
// Types (A2A Protocol Spec)
// ============================================

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  provider?: {
    organization: string;
    url?: string;
  };
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory?: boolean;
  };
  authentication?: {
    schemes: string[];
  };
  defaultInputModes?: string[];
  defaultOutputModes?: string[];
  skills: AgentSkill[];
  documentationUrl?: string;
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  inputModes?: string[];
  outputModes?: string[];
}

export type TaskStatus =
  | "submitted"
  | "working"
  | "input-required"
  | "auth-required"
  | "completed"
  | "failed"
  | "canceled"
  | "rejected"
  | "unknown";

export interface A2ATask {
  id: string;
  contextId?: string;
  status: TaskStatus;
  messages: A2AMessage[];
  artifacts: A2AArtifact[];
  history?: Array<{ status: TaskStatus; timestamp: string }>;
  pushNotificationConfig?: {
    url: string;
    authentication?: { schemes: string[] };
  };
}

export interface A2AMessage {
  messageId: string;
  role: "user" | "agent";
  parts: A2APart[];
  metadata?: Record<string, any>;
}

export type A2APart =
  | { text: string }
  | { file: { raw?: string; url?: string; mimeType: string } }
  | { data: Record<string, any> };

export interface A2AArtifact {
  artifactId: string;
  name: string;
  parts: A2APart[];
  append?: boolean;
  lastChunk?: boolean;
}

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, any>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

// A2A error codes
const A2A_ERRORS = {
  TASK_NOT_FOUND: { code: -32001, message: "Task not found" },
  TASK_NOT_CANCELABLE: { code: -32002, message: "Task not cancelable" },
  INVALID_METHOD: { code: -32601, message: "Method not found" },
  INVALID_PARAMS: { code: -32602, message: "Invalid params" },
  INTERNAL_ERROR: { code: -32603, message: "Internal error" },
} as const;

// ============================================
// A2A Server
// ============================================

type TaskExecutor = (task: A2ATask) => Promise<A2ATask>;

export class A2AServer {
  private app: Hono;
  private agentCard: AgentCard;
  private port: number;
  private tasks: Map<string, A2ATask> = new Map();
  private executor?: TaskExecutor;

  constructor(config: { port: number; agentCard: AgentCard }) {
    this.port = config.port;
    this.agentCard = config.agentCard;
    this.app = new Hono();
    this.setupRoutes();
  }

  /**
   * Register a task executor that processes incoming A2A tasks
   */
  onTask(executor: TaskExecutor): void {
    this.executor = executor;
  }

  private setupRoutes(): void {
    // Agent Card discovery endpoint
    this.app.get("/.well-known/agent.json", (c) => {
      return c.json(this.agentCard);
    });

    // JSON-RPC endpoint for A2A protocol
    this.app.post("/a2a", async (c) => {
      const body = await c.req.json<JsonRpcRequest>();

      if (body.jsonrpc !== "2.0") {
        return c.json(this.errorResponse(body.id, -32600, "Invalid JSON-RPC version"));
      }

      switch (body.method) {
        case "message/send":
          return c.json(await this.handleMessageSend(body));
        case "message/stream":
          // SSE streaming -- return initial acknowledgment
          return c.json(await this.handleMessageSend(body));
        case "tasks/get":
          return c.json(this.handleTasksGet(body));
        case "tasks/cancel":
          return c.json(this.handleTasksCancel(body));
        case "tasks/list":
          return c.json(this.handleTasksList(body));
        case "tasks/pushNotificationConfig/set":
          return c.json(this.handlePushConfig(body));
        default:
          return c.json(
            this.errorResponse(body.id, A2A_ERRORS.INVALID_METHOD.code, A2A_ERRORS.INVALID_METHOD.message)
          );
      }
    });
  }

  private async handleMessageSend(req: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = req.params || {};
    const taskId = params.taskId || `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const blocking = params.blocking !== false; // Default to blocking

    // Create or update task
    let task = this.tasks.get(taskId);
    if (!task) {
      task = {
        id: taskId,
        contextId: params.contextId,
        status: "submitted",
        messages: [],
        artifacts: [],
        history: [{ status: "submitted", timestamp: new Date().toISOString() }],
      };
      this.tasks.set(taskId, task);
    }

    // Add the incoming message
    const message: A2AMessage = {
      messageId: `msg_${Date.now()}`,
      role: "user",
      parts: params.message?.parts || [{ text: params.message?.text || "" }],
    };
    task.messages.push(message);

    // Process the task
    if (this.executor) {
      task.status = "working";
      task.history?.push({ status: "working", timestamp: new Date().toISOString() });

      try {
        if (blocking) {
          task = await this.executor(task);
          this.tasks.set(taskId, task);
        } else {
          // Non-blocking: execute in background
          this.executor(task).then((result) => {
            this.tasks.set(taskId, result);
            // Send push notification if configured
            if (task?.pushNotificationConfig?.url) {
              this.sendPushNotification(task.pushNotificationConfig.url, result);
            }
          });
        }
      } catch (error) {
        task.status = "failed";
        task.history?.push({ status: "failed", timestamp: new Date().toISOString() });
      }
    }

    return {
      jsonrpc: "2.0",
      id: req.id,
      result: task,
    };
  }

  private handleTasksGet(req: JsonRpcRequest): JsonRpcResponse {
    const taskId = req.params?.taskId;
    const task = this.tasks.get(taskId);

    if (!task) {
      return this.errorResponse(req.id, A2A_ERRORS.TASK_NOT_FOUND.code, A2A_ERRORS.TASK_NOT_FOUND.message);
    }

    return {
      jsonrpc: "2.0",
      id: req.id,
      result: task,
    };
  }

  private handleTasksCancel(req: JsonRpcRequest): JsonRpcResponse {
    const taskId = req.params?.taskId;
    const task = this.tasks.get(taskId);

    if (!task) {
      return this.errorResponse(req.id, A2A_ERRORS.TASK_NOT_FOUND.code, A2A_ERRORS.TASK_NOT_FOUND.message);
    }

    const terminalStates: TaskStatus[] = ["completed", "failed", "canceled", "rejected"];
    if (terminalStates.includes(task.status)) {
      return this.errorResponse(
        req.id,
        A2A_ERRORS.TASK_NOT_CANCELABLE.code,
        A2A_ERRORS.TASK_NOT_CANCELABLE.message
      );
    }

    task.status = "canceled";
    task.history?.push({ status: "canceled", timestamp: new Date().toISOString() });
    this.tasks.set(taskId, task);

    return {
      jsonrpc: "2.0",
      id: req.id,
      result: task,
    };
  }

  private handleTasksList(req: JsonRpcRequest): JsonRpcResponse {
    const tasks = Array.from(this.tasks.values());
    const status = req.params?.status;
    const filtered = status ? tasks.filter((t) => t.status === status) : tasks;

    return {
      jsonrpc: "2.0",
      id: req.id,
      result: {
        tasks: filtered,
        total: filtered.length,
      },
    };
  }

  private handlePushConfig(req: JsonRpcRequest): JsonRpcResponse {
    const taskId = req.params?.taskId;
    const task = this.tasks.get(taskId);

    if (!task) {
      return this.errorResponse(req.id, A2A_ERRORS.TASK_NOT_FOUND.code, A2A_ERRORS.TASK_NOT_FOUND.message);
    }

    task.pushNotificationConfig = {
      url: req.params?.pushNotificationConfig?.url,
      authentication: req.params?.pushNotificationConfig?.authentication,
    };
    this.tasks.set(taskId, task);

    return {
      jsonrpc: "2.0",
      id: req.id,
      result: { success: true },
    };
  }

  private async sendPushNotification(url: string, task: A2ATask): Promise<void> {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "TaskStatusUpdateEvent",
          taskId: task.id,
          status: task.status,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch {
      // Push notification delivery is best-effort
    }
  }

  private errorResponse(
    id: string | number,
    code: number,
    message: string
  ): JsonRpcResponse {
    return {
      jsonrpc: "2.0",
      id,
      error: { code, message },
    };
  }

  async start(): Promise<void> {
    console.log(`A2A Server starting on port ${this.port}`);
    console.log(`Agent Card: ${this.agentCard.url}/.well-known/agent.json`);
    // In production, use @hono/node-server to start
  }

  getApp(): Hono {
    return this.app;
  }
}

// ============================================
// A2A Client
// ============================================

export class A2AClient {
  private httpClient: typeof fetch;

  constructor() {
    this.httpClient = fetch;
  }

  /**
   * Discover an agent by fetching its Agent Card
   */
  async discoverAgent(baseUrl: string): Promise<AgentCard> {
    const url = `${baseUrl}/.well-known/agent.json`;
    const response = await this.httpClient(url);

    if (!response.ok) {
      throw new Error(`Failed to discover agent at ${url}: ${response.status}`);
    }

    return response.json() as Promise<AgentCard>;
  }

  /**
   * Send a message to an A2A agent (blocking mode)
   */
  async sendMessage(
    agentUrl: string,
    message: string,
    options?: {
      taskId?: string;
      contextId?: string;
      blocking?: boolean;
      files?: Array<{ raw: string; mimeType: string }>;
    }
  ): Promise<A2ATask> {
    const parts: A2APart[] = [{ text: message }];
    if (options?.files) {
      for (const file of options.files) {
        parts.push({ file: { raw: file.raw, mimeType: file.mimeType } });
      }
    }

    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: `req_${Date.now()}`,
      method: "message/send",
      params: {
        taskId: options?.taskId,
        contextId: options?.contextId,
        blocking: options?.blocking ?? true,
        message: {
          role: "user",
          parts,
        },
      },
    };

    const response = await this.httpClient(`${agentUrl}/a2a`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    const rpcResponse = (await response.json()) as JsonRpcResponse;

    if (rpcResponse.error) {
      throw new Error(`A2A error ${rpcResponse.error.code}: ${rpcResponse.error.message}`);
    }

    return rpcResponse.result as A2ATask;
  }

  /**
   * Get the status of an A2A task
   */
  async getTask(agentUrl: string, taskId: string): Promise<A2ATask> {
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: `req_${Date.now()}`,
      method: "tasks/get",
      params: { taskId },
    };

    const response = await this.httpClient(`${agentUrl}/a2a`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    const rpcResponse = (await response.json()) as JsonRpcResponse;

    if (rpcResponse.error) {
      throw new Error(`A2A error ${rpcResponse.error.code}: ${rpcResponse.error.message}`);
    }

    return rpcResponse.result as A2ATask;
  }

  /**
   * Cancel an A2A task
   */
  async cancelTask(agentUrl: string, taskId: string): Promise<A2ATask> {
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: `req_${Date.now()}`,
      method: "tasks/cancel",
      params: { taskId },
    };

    const response = await this.httpClient(`${agentUrl}/a2a`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    const rpcResponse = (await response.json()) as JsonRpcResponse;

    if (rpcResponse.error) {
      throw new Error(`A2A error ${rpcResponse.error.code}: ${rpcResponse.error.message}`);
    }

    return rpcResponse.result as A2ATask;
  }
}

export default { A2AServer, A2AClient };
