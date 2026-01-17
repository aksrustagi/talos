/**
 * Temporal Worker
 *
 * This worker process handles execution of workflows and activities.
 * Run separately from the main Hono server.
 */

import { Worker, NativeConnection } from "@temporalio/worker";
import * as activities from "./activities";

async function run() {
  // Connect to Temporal server
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
  });

  // Create worker
  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || "default",
    taskQueue: "procurement-agents",
    workflowsPath: require.resolve("./workflows"),
    activities,
    // Worker options
    maxConcurrentActivityTaskExecutions: 10,
    maxConcurrentWorkflowTaskExecutions: 10,
  });

  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   🤖 TALOS - Temporal Worker Started                            ║
║                                                                  ║
║   Task Queue: procurement-agents                                 ║
║   Temporal Server: ${process.env.TEMPORAL_ADDRESS || "localhost:7233"}
║                                                                  ║
║   Available Workflows:                                           ║
║   • priceWatchDailyScanWorkflow                                 ║
║   • requisitionProcessingWorkflow                               ║
║   • invoiceValidationWorkflow                                   ║
║   • contractRenewalWorkflow                                     ║
║   • catalogSyncWorkflow                                         ║
║   • anomalyInvestigationWorkflow                                ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
  `);

  // Start the worker
  await worker.run();
}

// Handle shutdown gracefully
process.on("SIGINT", () => {
  console.log("\nShutting down Temporal worker...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\nShutting down Temporal worker...");
  process.exit(0);
});

run().catch((err) => {
  console.error("Worker failed to start:", err);
  process.exit(1);
});
