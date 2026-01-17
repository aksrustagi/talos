/**
 * Talos - Comprehensive University Procurement AI Platform
 *
 * Main entry point for the application.
 * This exports all modules and starts the server.
 */

// Server
export { app, startServer } from "./server";

// Routes
export * from "./routes";

// Middleware
export * from "./middleware";

// Types
export * from "./types";

// Intelligence Systems
export * from "./intelligence";

// Temporal Workflows
export * from "./temporal";

// LangGraph Agents
export * from "./langgraph";

// Agent Prompts
export * from "./agents";

// Default export starts the server
import { startServer } from "./server";

if (require.main === module) {
  startServer();
}
