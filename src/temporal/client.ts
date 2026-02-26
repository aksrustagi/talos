/**
 * Temporal Client
 *
 * Client for starting and interacting with Temporal workflows from the API.
 */

import { Client, Connection } from "@temporalio/client";

let client: Client | null = null;

/**
 * Get or create a Temporal client singleton
 */
export async function getTemporalClient(): Promise<Client> {
  if (client) {
    return client;
  }

  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
  });

  client = new Client({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || "default",
  });

  return client;
}

/**
 * Start a workflow and return the handle
 */
export async function startWorkflow<T extends (...args: any[]) => any>(
  workflow: T,
  options: {
    taskQueue: string;
    workflowId: string;
    args: Parameters<T>;
  }
) {
  const temporalClient = await getTemporalClient();
  const handle = await temporalClient.workflow.start(workflow, {
    taskQueue: options.taskQueue,
    workflowId: options.workflowId,
    args: options.args,
  });

  return {
    workflowId: handle.workflowId,
    runId: handle.firstExecutionRunId,
  };
}

/**
 * Get a workflow handle by ID
 */
export async function getWorkflowHandle(workflowId: string) {
  const temporalClient = await getTemporalClient();
  return temporalClient.workflow.getHandle(workflowId);
}

/**
 * Query a workflow
 */
export async function queryWorkflow<T>(
  workflowId: string,
  query: string
): Promise<T> {
  const handle = await getWorkflowHandle(workflowId);
  return handle.query<T>(query);
}

/**
 * Signal a workflow
 */
export async function signalWorkflow(
  workflowId: string,
  signal: string,
  args: any[]
): Promise<void> {
  const handle = await getWorkflowHandle(workflowId);
  await handle.signal(signal, ...args);
}

/**
 * Get workflow result (waits for completion)
 */
export async function getWorkflowResult<T>(workflowId: string): Promise<T> {
  const handle = await getWorkflowHandle(workflowId);
  return handle.result() as Promise<T>;
}

/**
 * Cancel a workflow
 */
export async function cancelWorkflow(workflowId: string): Promise<void> {
  const handle = await getWorkflowHandle(workflowId);
  await handle.cancel();
}

/**
 * Describe a workflow (get status, etc.)
 */
export async function describeWorkflow(workflowId: string) {
  const handle = await getWorkflowHandle(workflowId);
  return handle.describe();
}
