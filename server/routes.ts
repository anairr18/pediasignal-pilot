import type { Express } from "express";
import { createServer, type Server } from "http";
import path from "path";
import fs from "fs";
import { setupSecurityMiddleware } from "./security";

// Import modular routes
import authRoutes from "./routes/auth";
import ragRoutes from "./routes/rag";
import simulationRoutes from "./routes/simulation";
import rulesRoutes from "./routes/rules";
import analyticsRoutes from "./routes/analytics";

export async function registerRoutes(app: Express): Promise<Server> {

  // Setup security middleware for HIPAA/SOC 2 compliance
  setupSecurityMiddleware(app);

  // Auth Routes (Middleware is internal to the module or handled globally if desired)
  app.use("/api", authRoutes); // /api/login, /api/register, /api/user

  // RAG & Knowledge Base Routes
  app.use("/api", ragRoutes);

  // Simulation & Case Banking Routes
  app.use("/api", simulationRoutes);

  // Rules Engine Routes (Dosing, Algos, Vitals)
  app.use("/api/rules", rulesRoutes);

  // Analytics & Stats Routes
  app.use("/api", analyticsRoutes);

  // Favicon route (Legacy / Utils)
  app.get('/favicon.jpg', (req, res) => {
    const faviconPath = path.join(process.cwd(), 'client', 'public', 'favicon.jpg');
    if (fs.existsSync(faviconPath)) {
      res.sendFile(faviconPath);
    } else {
      res.status(404).send('Favicon not found');
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
