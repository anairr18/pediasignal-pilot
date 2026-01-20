import { Router } from "express";
import { ALIEM_CASES } from '../caseBank.aliem';

const router = Router();

// Get available drugs and dosing information
router.get('/drugs', async (req, res) => {
    try {
        try {
            const { getAvailableDrugs } = await import('../rules/rules');
            const drugs = await getAvailableDrugs();

            res.json({
                drugs,
                license: "CC BY-NC-SA 4.0",
                sourceVersion: "aliem-rescu-peds-2021-03-29",
                attribution: "ALiEM EM ReSCu Peds - Pediatric Emergency Medicine Cases"
            });

        } catch (rulesError) {
            console.warn('Rules service failed:', rulesError);
            // Fallback to basic drug list
            const fallbackDrugs = [
                { name: "lorazepam", route: "IV", mgPerKgMin: 0.05, mgPerKgMax: 0.1, maxDose: 2 },
                { name: "midazolam", route: "IV", mgPerKgMin: 0.1, mgPerKgMax: 0.2, maxDose: 5 },
                { name: "fentanyl", route: "IV", mgPerKgMin: 0.5, mgPerKgMax: 1, maxDose: 50 },
                { name: "ketamine", route: "IV", mgPerKgMin: 1, mgPerKgMax: 2, maxDose: 100 }
            ];

            res.json({
                drugs: fallbackDrugs,
                license: "CC BY-NC-SA 4.0",
                sourceVersion: "aliem-rescu-peds-2021-03-29",
                attribution: "ALiEM EM ReSCu Peds - Pediatric Emergency Medicine Cases",
                fallback: true
            });
        }

    } catch (error) {
        console.error('Drugs error:', error);
        res.status(500).json({
            message: "Failed to get drugs",
            error: (error as Error).message
        });
    }
});

// Get available cases from rules service (e.g. for selection UI)
router.get('/cases', async (req, res) => {
    try {
        try {
            const { getAvailableCases } = await import('../rules/rules');
            const cases = await getAvailableCases();

            res.json({
                cases,
                license: "CC BY-NC-SA 4.0",
                sourceVersion: "aliem-rescu-peds-2021-03-29",
                attribution: "ALiEM EM ReSCu Peds - Pediatric Emergency Medicine Cases"
            });

        } catch (rulesError) {
            console.warn('Rules service failed:', rulesError);

            // Fallback to case bank (imported dynamically to avoid circular deps if needed)
            const { caseBank } = await import('../caseBank');
            const fallbackCases = caseBank.map(c => ({
                id: c.id,
                name: c.name,
                category: c.category,
                difficulty: c.difficulty,
                estimatedTime: c.estimatedTime
            }));

            res.json({
                cases: fallbackCases,
                license: "CC BY-NC-SA 4.0",
                sourceVersion: "aliem-rescu-peds-2021-03-29",
                attribution: "ALiEM EM ReSCu Peds - Pediatric Emergency Medicine Cases",
                fallback: true
            });
        }

    } catch (error) {
        console.error('Cases error:', error);
        res.status(500).json({
            message: "Failed to get cases",
            error: (error as Error).message
        });
    }
});

// Get vital curves and deterioration patterns
router.post('/vital-curve', async (req, res) => {
    try {
        const { curveId, caseId, stage } = req.body;

        if (!curveId && !caseId) {
            return res.status(400).json({ message: "Either curveId or caseId required" });
        }

        try {
            const { getVitalCurve } = await import('../rules/rules');
            const vitalCurve = await getVitalCurve(curveId || `${caseId}-stage-${stage}`);

            if (!vitalCurve) {
                return res.status(404).json({ message: "Vital curve not found" });
            }

            res.json({
                vitalCurve,
                license: "CC BY-NC-SA 4.0",
                sourceVersion: "aliem-rescu-peds-2021-03-29",
                attribution: "ALiEM EM ReSCu Peds - Pediatric Emergency Medicine Cases"
            });

        } catch (rulesError) {
            console.warn('Rules service failed:', rulesError);
            res.status(500).json({
                message: "Failed to get vital curve from rules service",
                error: (rulesError instanceof Error ? rulesError.message : 'Unknown error')
            });
        }

    } catch (error) {
        console.error('Vital curve error:', error);
        res.status(500).json({
            message: "Failed to get vital curve",
            error: (error as Error).message
        });
    }
});

// Get critical actions with time windows
router.post('/critical-actions', async (req, res) => {
    try {
        const { caseId, stage } = req.body;

        if (!caseId || !stage) {
            return res.status(400).json({ message: "Case ID and stage required" });
        }

        try {
            const { getCriticalActions } = await import('../rules/rules');
            const criticalActions = await getCriticalActions(caseId, stage);

            res.json({
                ...criticalActions,
                license: "CC BY-NC-SA 4.0",
                sourceVersion: "aliem-rescu-peds-2021-03-29",
                attribution: "ALiEM EM ReSCu Peds - Pediatric Emergency Medicine Cases"
            });

        } catch (rulesError) {
            console.warn('Rules service failed:', rulesError);
            res.status(500).json({
                message: "Failed to get critical actions from rules service",
                error: (rulesError instanceof Error ? rulesError.message : 'Unknown error')
            });
        }

    } catch (error) {
        console.error('Critical actions error:', error);
        res.status(500).json({
            message: "Failed to get critical actions",
            error: (error as Error).message
        });
    }
});

// Get drug doses from rules service
router.post('/dose', async (req, res) => {
    try {
        const { drug, weight, age } = req.body;

        if (!drug || !weight) {
            return res.status(400).json({ message: "Drug and weight required" });
        }

        try {
            const { getDose } = await import('../rules/rules');
            const doseResponse = await getDose({ drug, weight, age });

            res.json({
                ...doseResponse,
                license: "CC BY-NC-SA 4.0",
                sourceVersion: "aliem-rescu-peds-2021-03-29",
                attribution: "ALiEM EM ReSCu Peds - Pediatric Emergency Medicine Cases"
            });

        } catch (rulesError) {
            console.warn('Rules service failed:', rulesError);
            res.status(500).json({
                message: "Failed to get dose from rules service",
                error: (rulesError instanceof Error ? rulesError.message : 'Unknown error')
            });
        }

    } catch (error) {
        console.error('Dose calculation error:', error);
        res.status(500).json({
            message: "Failed to calculate dose",
            error: (error as Error).message
        });
    }
});

// Get algorithm steps from rules service
router.post('/algo', async (req, res) => {
    try {
        const { caseId, stage, currentVitals } = req.body;

        if (!caseId || !stage) {
            return res.status(400).json({ message: "Case ID and stage required" });
        }

        try {
            const { getAlgo } = await import('../rules/rules');
            const algoResponse = await getAlgo({ caseId, stage, currentVitals: currentVitals || {} });

            res.json({
                ...algoResponse,
                license: "CC BY-NC-SA 4.0",
                sourceVersion: "aliem-rescu-peds-2021-03-29",
                attribution: "ALiEM EM ReSCu Peds - Pediatric Emergency Medicine Cases"
            });

        } catch (rulesError) {
            console.warn('Rules service failed:', rulesError);
            res.status(500).json({
                message: "Failed to get algorithm from rules service",
                error: (rulesError instanceof Error ? rulesError.message : 'Unknown error')
            });
        }

    } catch (error) {
        console.error('Algorithm retrieval error:', error);
        res.status(500).json({
            message: "Failed to retrieve algorithm",
            error: (error as Error).message
        });
    }
});



export default router;
