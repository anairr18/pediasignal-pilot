import { Router } from "express";
import { isAuthenticated } from "../middleware/auth";

const router = Router();

// PubMed clinical reasoning
router.post('/pubmed/clinical-reasoning', async (req, res) => {
    try {
        const { intervention, caseType, ageGroup, limit } = req.body;

        if (!intervention) {
            return res.status(400).json({ message: "Intervention required" });
        }

        try {
            const { searchPubMed } = await import('../rag/pubmed');

            const pubmedResult = await searchPubMed({
                intervention: intervention,
                caseType: caseType || 'pediatric_emergency',
                ageGroup: ageGroup || 'pediatric',
                limit: limit || 5,
            });

            res.json({
                results: pubmedResult,
                intervention,
                caseType,
                ageGroup,
                license: "CC BY-NC-SA 4.0",
                sourceVersion: "aliem-rescu-peds-2021-03-29",
                attribution: "ALiEM EM ReSCu Peds - Pediatric Emergency Medicine Cases"
            });

        } catch (pubmedError) {
            console.warn('PubMed search failed:', pubmedError);
            res.status(500).json({
                message: "Failed to search PubMed",
                error: (pubmedError instanceof Error ? pubmedError.message : 'Unknown error')
            });
        }

    } catch (error) {
        console.error('PubMed clinical reasoning error:', error);
        res.status(500).json({
            message: "Failed to get clinical reasoning",
            error: (error as Error).message
        });
    }
});

// RAG query for clinical reasoning
router.post('/rag/query', isAuthenticated, async (req, res) => {
    try {
        const { query, caseId, stage, section, tags, limit, sessionId } = req.body;
        const userId = (req.user as any).id;

        if (!query || !sessionId) {
            return res.status(400).json({ message: "Query and sessionId required" });
        }

        try {
            const { retrievePassages } = await import('../rag/retriever');

            const ragResult = await retrievePassages({
                query,
                caseId,
                stage,
                section,
                tags,
                limit: limit || 10,
                userId,
                sessionId
            });

            res.json({
                ...ragResult,
                license: "CC BY-NC-SA 4.0",
                sourceVersion: "aliem-rescu-peds-2021-03-29",
                attribution: "ALiEM EM ReSCu Peds - Pediatric Emergency Medicine Cases"
            });

        } catch (ragError) {
            console.warn('RAG retrieval failed:', ragError);
            res.status(500).json({
                message: "Failed to retrieve RAG passages",
                error: (ragError instanceof Error ? ragError.message : 'Unknown error')
            });
        }

    } catch (error) {
        console.error('RAG query error:', error);
        res.status(500).json({
            message: "Failed to process RAG query",
            error: (error as Error).message
        });
    }
});

// Get RAG cache statistics
router.get('/rag/stats', async (req, res) => {
    try {
        try {
            const { getCacheStats, clearSessionCache } = await import('../rag/retriever');
            const cacheStats = getCacheStats();

            res.json({
                cacheStats,
                license: "CC BY-NC-SA 4.0",
                sourceVersion: "aliem-rescu-peds-2021-03-29",
                attribution: "ALiEM EM ReSCu Peds - Pediatric Emergency Medicine Cases"
            });

        } catch (ragError) {
            console.warn('RAG stats failed:', ragError);
            res.status(500).json({
                message: "Failed to get RAG cache statistics",
                error: (ragError instanceof Error ? ragError.message : 'Unknown error')
            });
        }

    } catch (error) {
        console.error('RAG stats error:', error);
        res.status(500).json({
            message: "Failed to get RAG statistics",
            error: (error as Error).message
        });
    }
});

// Clear RAG session cache
router.post('/rag/clear-cache', async (req, res) => {
    try {
        const { sessionId } = req.body;

        try {
            const { clearSessionCache } = await import('../rag/retriever');

            if (sessionId) {
                clearSessionCache(sessionId);
            } else {
                // Clear all sessions by clearing the entire cache
                const { clearAllCache } = await import('../rag/retriever');
                clearAllCache();
            }

            res.json({
                message: "Cache cleared successfully",
                sessionId: sessionId || 'all',
                license: "CC BY-NC-SA 4.0",
                sourceVersion: "aliem-rescu-peds-2021-03-29",
                attribution: "ALiEM EM ReSCu Peds - Pediatric Emergency Medicine Cases"
            });

        } catch (ragError) {
            console.warn('RAG cache clear failed:', ragError);
            res.status(500).json({
                message: "Failed to clear RAG cache",
                error: (ragError instanceof Error ? ragError.message : 'Unknown error')
            });
        }

    } catch (error) {
        console.error('RAG cache clear error:', error);
        res.status(500).json({
            message: "Failed to clear cache",
            error: (error as Error).message
        });
    }
});

// PubMed search suggestions
router.get('/pubmed/suggestions', async (req, res) => {
    try {
        const { query, caseType, ageGroup } = req.query;

        if (!query) {
            return res.status(400).json({ message: "Query required" });
        }

        try {
            const { searchPubMed } = await import('../rag/pubmed');

            const suggestions = await searchPubMed({
                intervention: query as string,
                caseType: (caseType as string) || 'pediatric_emergency',
                ageGroup: (ageGroup as "neonatal" | "infant" | "child" | "adolescent") || 'child',
                limit: 3 // Just a few suggestions
            });

            res.json({
                suggestions,
                query,
                caseType: caseType || 'pediatric_emergency',
                ageGroup: ageGroup || 'pediatric',
                license: "CC BY-NC-SA 4.0",
                sourceVersion: "aliem-rescu-peds-2021-03-29",
                attribution: "ALiEM EM ReSCu Peds - Pediatric Emergency Medicine Cases"
            });

        } catch (pubmedError) {
            console.warn('PubMed suggestions failed:', pubmedError);
            res.status(500).json({
                message: "Failed to get PubMed suggestions",
                error: (pubmedError instanceof Error ? pubmedError.message : 'Unknown error')
            });
        }

    } catch (error) {
        console.error('PubMed suggestions error:', error);
        res.status(500).json({
            message: "Failed to get PubMed suggestions",
            error: (error as Error).message
        });
    }
});

export default router;
