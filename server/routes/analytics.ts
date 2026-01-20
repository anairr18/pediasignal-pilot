import { Router } from "express";
import { isAuthenticated } from "../middleware/auth";
import { storage } from "../storage";

const router = Router();

router.get('/simulation/stats', isAuthenticated, async (req, res) => {
    try {
        const { timeRange } = req.query;
        const userId = (req.user as any).id;

        try {
            const userSimulations = await storage.getUserSimulations(userId);

            const totalSimulations = userSimulations.length;
            const completedSimulations = userSimulations.filter((s: any) => s.status === 'completed').length;
            const averageScore = userSimulations.length > 0
                ? userSimulations.reduce((sum: number, s: any) => sum + (s.score || 0), 0) / userSimulations.length
                : 0;

            let ragStats = {
                totalQueries: 0,
                evidenceSources: 0,
                objectivesMet: 0,
                riskFlagsIdentified: 0
            };

            try {
                const { getCacheStats } = await import('../rag/retriever');
                const cacheStats = getCacheStats();
                ragStats = {
                    totalQueries: cacheStats.totalEntries || 0,
                    evidenceSources: cacheStats.totalSessions || 0,
                    objectivesMet: cacheStats.totalEntries || 0,
                    riskFlagsIdentified: cacheStats.totalSessions || 0
                };
            } catch (ragError) {
                console.warn('RAG stats failed:', ragError);
            }

            const categoryBreakdown = userSimulations.reduce((acc: Record<string, number>, sim: any) => {
                acc[sim.caseType] = (acc[sim.caseType] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);

            res.json({
                userId,
                timeRange: timeRange || 'all',
                statistics: {
                    totalSimulations,
                    completedSimulations,
                    completionRate: totalSimulations > 0 ? (completedSimulations / totalSimulations) * 100 : 0,
                    averageScore: Math.round(averageScore * 100) / 100,
                    categoryBreakdown
                },
                ragAnalytics: ragStats,
                license: "CC BY-NC-SA 4.0",
                sourceVersion: "aliem-rescu-peds-2021-03-29",
                attribution: "ALiEM EM ReSCu Peds - Pediatric Emergency Medicine Cases"
            });

        } catch (storageError) {
            console.warn('Storage stats failed:', storageError);
            res.status(500).json({
                message: "Failed to get simulation statistics",
                error: (storageError instanceof Error ? storageError.message : 'Unknown error')
            });
        }

    } catch (error) {
        console.error('Simulation stats error:', error);
        res.status(500).json({
            message: "Failed to get simulation statistics",
            error: (error as Error).message
        });
    }
});

router.get('/telemetry/analytics', isAuthenticated, async (req, res) => {
    try {
        const { timeRange } = req.query;
        const userId = (req.user as any).id;

        try {
            const { getTelemetryMetrics, getObjectiveMetrics } = await import('../telemetry/telemetryService');

            const metrics = await getTelemetryMetrics((timeRange as 'day' | 'week' | 'month') || 'week');
            const objectiveMetrics = await getObjectiveMetrics(userId);

            res.json({
                metrics,
                objectiveMetrics,
                timeRange: timeRange || 'week',
                userId: userId || null,
                license: "CC BY-NC-SA 4.0",
                sourceVersion: "aliem-rescu-peds-2021-03-29",
                attribution: "ALiEM EM ReSCu Peds - Pediatric Emergency Medicine Cases"
            });

        } catch (telemetryError) {
            console.warn('Telemetry analytics failed:', telemetryError);
            res.status(500).json({
                message: "Failed to get telemetry analytics",
                error: (telemetryError instanceof Error ? telemetryError.message : 'Unknown error')
            });
        }

    } catch (error) {
        console.error('Telemetry analytics error:', error);
        res.status(500).json({
            message: "Failed to get telemetry analytics",
            error: (error as Error).message
        });
    }
});

export default router;
