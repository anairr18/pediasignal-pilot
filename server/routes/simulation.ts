import { Router } from "express";
import { isAuthenticated } from "../middleware/auth";
import { storage } from "../storage";
import {
    getRandomCase,
    evaluateSimulation,
    caseBank,
    type SimulationSession,
    type CaseDefinition
} from "../caseBank";
import { ALIEM_CASES } from '../caseBank.aliem';
import { tick, type TickInput } from "../rules/deterioration";
import type { VitalSigns } from "@shared/types";

const router = Router();

// Static Knowledge Bases (Optimized: moved out of request handlers)
const MEDICAL_KNOWLEDGE = {
    'aliem_case_01_anaphylaxis': {
        1: {
            objectives: [
                'Recognize signs of anaphylaxis: facial swelling, difficulty breathing, wheezing, rash, vomiting',
                'Understand the urgency of immediate resuscitation area placement and monitoring',
                'Know correct epinephrine administration: 0.01 mg/kg IM (max 0.3 mg) in anterolateral thigh',
                'Recognize that IM epinephrine should show improvement in a few minutes but not complete resolution'
            ],
            riskFlags: [
                'Delayed epinephrine administration increases mortality risk',
                'Incorrect dosing can be ineffective or harmful',
                'Not having epinephrine readily available delays treatment',
                'Delayed placement in resuscitation area delays critical interventions'
            ]
        }
    },
    'aliem_case_02_cardiac_tamponade': {
        1: {
            objectives: [
                'Recognize Beck\'s triad: hypotension, muffled heart sounds, distended neck veins',
                'Understand the need for immediate pericardiocentesis',
                'Know the risks of delayed intervention'
            ],
            riskFlags: [
                'Delayed pericardiocentesis can lead to cardiac arrest',
                'Incomplete drainage may lead to re-accumulation',
                'Risk of coronary artery injury during procedure'
            ]
        }
    }
};

const INTERVENTION_KNOWLEDGE = {
    'aliem_case_01_anaphylaxis': {
        1: {
            'Placement in resuscitation': {
                explanation: 'Patient should be quickly moved to a resuscitation area for immediate assessment and treatment. This ensures access to all necessary equipment and medications.',
                evidenceSources: ['PALS Guidelines 2020 - Anaphylaxis Management', 'ALiEM ReSCu Peds Case 1'],
                riskFlags: ['Delayed placement delays critical interventions', 'Inadequate monitoring in non-resuscitation area'],
                objectiveHits: ['Immediate recognition of anaphylaxis severity', 'Proper patient placement for critical care']
            },
            'Exam including airway and lung assessment': {
                explanation: 'Comprehensive airway and lung assessment to evaluate for stridor, wheezing, and respiratory compromise. Critical for determining severity and need for airway intervention.',
                evidenceSources: ['PALS Guidelines 2020 - Anaphylaxis Management'],
                riskFlags: ['Incomplete assessment may miss airway compromise', 'Delayed recognition of respiratory deterioration'],
                objectiveHits: ['Airway assessment in anaphylaxis', 'Recognition of respiratory compromise']
            },
            'Placement on cardiovascular monitoring': {
                explanation: 'Continuous cardiac monitoring for heart rate, blood pressure, and rhythm. Essential for detecting cardiovascular compromise and response to treatment.',
                evidenceSources: ['PALS Guidelines 2020 - Anaphylaxis Management'],
                riskFlags: ['Inadequate monitoring may miss cardiovascular deterioration', 'Delayed recognition of shock'],
                objectiveHits: ['Cardiovascular monitoring in anaphylaxis', 'Recognition of cardiovascular compromise']
            },
            'IM epinephrine given': {
                explanation: 'IM epinephrine 0.01 mg/kg (max 0.3 mg) in anterolateral thigh is the gold standard first-line treatment for anaphylaxis. Administer immediately upon recognition of anaphylaxis symptoms.',
                evidenceSources: ['PALS Guidelines 2020 - Anaphylaxis Management', 'ALiEM ReSCu Peds Case 1'],
                riskFlags: ['Delayed administration increases mortality risk', 'Incorrect dosing can be ineffective or harmful'],
                objectiveHits: ['Immediate recognition and treatment of anaphylaxis', 'Correct epinephrine administration technique']
            },
            'Oxygen administration': {
                explanation: 'Place oxygen on patient by mask or nebulizer to improve oxygenation. Any O2 administration will increase SpO2 to 99-100%.',
                evidenceSources: ['PALS Guidelines 2020 - Anaphylaxis Management'],
                riskFlags: ['Inadequate oxygenation may worsen respiratory compromise', 'Delayed O2 administration'],
                objectiveHits: ['Oxygen therapy in anaphylaxis', 'Monitoring oxygenation response']
            },
            'pericardiocentesis': {
                explanation: 'Emergency pericardiocentesis is indicated for cardiac tamponade. Use subxiphoid approach with ultrasound guidance when possible. Prepare for potential thoracotomy if pericardiocentesis fails.',
                evidenceSources: ['PALS Guidelines 2020 - Cardiac Tamponade Management'],
                riskFlags: ['Risk of coronary artery injury', 'Incomplete drainage may lead to re-accumulation'],
                objectiveHits: ['Recognition of cardiac tamponade', 'Emergency pericardiocentesis technique']
            }
        }
    },
    'aliem_case_02_cardiac_tamponade': {
        1: {
            'pericardiocentesis': {
                explanation: 'Emergency pericardiocentesis is indicated for cardiac tamponade. Use subxiphoid approach with ultrasound guidance when possible. Prepare for potential thoracotomy if pericardiocentesis fails.',
                evidenceSources: ['PALS Guidelines 2020 - Cardiac Tamponade Management'],
                riskFlags: ['Risk of coronary artery injury', 'Incomplete drainage may lead to re-accumulation'],
                objectiveHits: ['Recognition of cardiac tamponade', 'Emergency pericardiocentesis technique']
            }
        }
    }
};


router.get('/test-cases', (req, res) => {
    try {
        const totalCases = caseBank.length;
        const aliEmCases = caseBank.filter(case_ => case_.id.startsWith('aliem_'));
        const legacyCases = caseBank.filter(case_ => !case_.id.startsWith('aliem_'));

        res.json({
            totalCases,
            aliEmCases: aliEmCases.length,
            legacyCases: legacyCases.length,
            aliEmCaseIds: aliEmCases.map(c => c.id),
            message: 'Case bank status check'
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to check case bank', details: (error as Error).message });
    }
});

router.get('/debug-aliem', (req, res) => {
    try {
        res.json({
            aliemCasesCount: ALIEM_CASES.length,
            aliemCaseIds: ALIEM_CASES.map(c => c.id),
            aliemCategories: ALIEM_CASES.map(c => c.category),
            firstCase: ALIEM_CASES[0] ? {
                id: ALIEM_CASES[0].id,
                category: ALIEM_CASES[0].category,
                displayName: ALIEM_CASES[0].displayName
            } : null,
            message: 'ALIEM_CASES debug info'
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to check ALIEM_CASES', details: (error as Error).message });
    }
});

router.post('/start-simulation', isAuthenticated, async (req, res) => {
    try {
        const { category } = req.body;
        const userId = (req.user as any).id;

        if (!category || !userId) {
            return res.status(400).json({ message: "Category and userId required" });
        }

        // Get random ALiEM case for the category
        const aliemCases = ALIEM_CASES.filter(c => c.category === category);

        if (aliemCases.length === 0) {
            return res.status(400).json({ message: "No cases found for category" });
        }

        const randomCase = aliemCases[Math.floor(Math.random() * aliemCases.length)];
        const randomVariant = randomCase.variants[Math.floor(Math.random() * randomCase.variants.length)];

        // Convert to legacy format for compatibility
        const caseDefinition: CaseDefinition = {
            id: `${randomCase.id}_${randomVariant.variantId.toLowerCase()}`,
            name: randomCase.displayName,
            category: randomCase.category as any, // ALiEM categories don't match legacy enum
            difficulty: 'intermediate' as const,
            description: `${randomCase.displayName} simulation case from ALiEM EM ReSCu Peds`,
            estimatedTime: randomVariant.stages.reduce((total, stage) => total + stage.TTIsec, 0) / 60, // Convert to minutes
            clinicalHistory: randomCase.clinicalHistory || `Patient presenting with ${randomCase.displayName.toLowerCase()}`,
            presentingSymptoms: randomVariant.stages[0]?.requiredInterventions || [],
            learningObjectives: randomVariant.stages.flatMap(stage => stage.requiredInterventions),
            initialVitals: {
                heartRate: randomVariant.initialVitals.heartRate || 100,
                temperature: randomVariant.initialVitals.temperature || 98.6,
                respRate: randomVariant.initialVitals.respRate || 20,
                bloodPressure: randomVariant.initialVitals.bloodPressureSys ?
                    `${randomVariant.initialVitals.bloodPressureSys}/${randomVariant.initialVitals.bloodPressureDia}` : '120/80',
                oxygenSat: randomVariant.initialVitals.spo2 || 98,
                bloodGlucose: randomVariant.initialVitals.bloodGlucose || undefined,
                consciousness: randomVariant.initialVitals.consciousness || 'alert'
            },
            stages: randomVariant.stages.map(stage => ({
                stage: stage.stage,
                name: stage.name,
                description: `${stage.name} - ${stage.severity} severity`,
                timeLimit: stage.TTIsec,
                requiredInterventions: stage.requiredInterventions,
                helpful: stage.helpful,
                harmful: stage.harmful,
                neutral: stage.neutral,
                ordered: stage.ordered,
                severity: stage.severity,
                ageBand: randomVariant.ageBand,
                TTIsec: stage.TTIsec,
                vitalBounds: {
                    heartRate: { min: 60, max: 200 },
                    respRate: { min: 12, max: 60 },
                    bloodPressureSys: { min: 60, max: 200 },
                    bloodPressureDia: { min: 40, max: 120 },
                    spo2: { min: 85, max: 100 },
                    temperature: { min: 35, max: 42 },
                    capillaryRefill: { min: 0, max: 5 }
                },
                requiredActions: stage.requiredInterventions,
                optionalActions: stage.helpful,
                criticalFailures: stage.harmful,
                nextStageConditions: ['Complete required interventions'],
                clinicalReasoning: `Stage ${stage.stage} focuses on ${stage.name.toLowerCase()}`,
                evidenceSources: [{
                    caseId: randomCase.id,
                    section: stage.name,
                    passageId: stage.stage,
                    sourceCitation: randomCase.sourceCitation,
                    license: randomCase.license
                }],
                criticalActions: stage.requiredInterventions,
                vitals: randomVariant.initialVitals as any,
                availableInterventions: [
                    ...stage.requiredInterventions,
                    ...stage.helpful,
                    ...stage.harmful,
                    ...stage.neutral
                ],
                branchingConditions: [{
                    condition: 'Complete required interventions',
                    nextStage: stage.stage + 1,
                    vitalsChange: {}
                }]
            })) as any,
            goldStandardActions: randomVariant.stages.map(stage => ({
                stage: stage.stage,
                actions: stage.requiredInterventions,
                critical: stage.severity === 'critical',
                timeLimit: stage.TTIsec,
                points: stage.requiredInterventions.length * 10
            })),
            references: [randomCase.sourceCitation]
        };

        // Store session
        const simulationData = {
            userId,
            caseType: caseDefinition.id,
            stage: 1,
            vitals: (caseDefinition.initialVitals || { heartRate: 120, temperature: 98.6, respRate: 20, spo2: 98, bloodPressureSys: 90, bloodPressureDia: 60 }) as VitalSigns,
            interventions: [],
            aiExplanations: [],
            status: 'active' as const,
            evidenceSources: [],
            objectiveHits: [],
            riskFlags: []
        };

        const simulation = await storage.createSimulation(simulationData);

        // Get evidence-based medical knowledge for first stage
        let objectives = caseDefinition.learningObjectives || [];
        let criticalActions = caseDefinition.stages[0].criticalActions || [];

        const caseKnowledge = (MEDICAL_KNOWLEDGE as any)[caseDefinition.id];
        if (caseKnowledge && caseKnowledge[1]) {
            objectives = caseKnowledge[1].objectives;
            if (caseKnowledge[1].riskFlags) {
                criticalActions = [...criticalActions, ...caseKnowledge[1].riskFlags];
            }
        }

        res.json({
            sessionId: `sim_${Date.now()}_${userId}`,
            simulationId: simulation.id,
            caseDefinition,
            currentStage: 1,
            vitals: (caseDefinition.initialVitals || { heartRate: 120, temperature: 98.6, respRate: 20, spo2: 98, bloodPressureSys: 90, bloodPressureDia: 60 }) as VitalSigns,
            availableInterventions: caseDefinition.stages[0].availableInterventions,
            timeLimit: caseDefinition.stages[0].timeLimit,
            criticalActions,
            objectives,
            evidenceSources: [],
            riskFlags: [],
            license: randomCase.license,
            sourceVersion: randomCase.sourceVersion,
            attribution: randomCase.sourceCitation
        });

    } catch (error) {
        console.error('Start simulation error:', error);
        res.status(500).json({
            message: "Failed to start simulation",
            error: (error as Error).message
        });
    }
});

router.post('/case-tick', async (req, res) => {
    try {
        const { caseType, stage, severity, ageBand, currentVitals, timeElapsed, userId, sessionId } = req.body;

        if (!caseType || !currentVitals || typeof timeElapsed !== 'number') {
            return res.status(400).json({ message: "Missing required fields: caseType, currentVitals, timeElapsed" });
        }

        const tickInput: TickInput = {
            caseType,
            stage: stage || 1,
            severity: severity || 'moderate',
            ageBand: ageBand || 'child',
            vitals: {
                heartRate: currentVitals.heartRate || 100,
                respRate: currentVitals.respRate || 20,
                bloodPressureSys: currentVitals.bloodPressureSys || 120,
                bloodPressureDia: currentVitals.bloodPressureDia || 80,
                spo2: currentVitals.spo2 || 98,
                temperature: currentVitals.temperature || 98.6,
                consciousness: currentVitals.consciousness || 'alert',
                capillaryRefill: currentVitals.capillaryRefill || 2.0
            },
            elapsedSec: timeElapsed
        };

        const tickOutput = tick(tickInput);

        // Thresholded persistence
        let simulationId: string | undefined;
        if (sessionId) {
            const oldVitals = currentVitals;
            const newVitals = tickOutput.vitals;

            const hasSignificantChange =
                Math.abs(newVitals.heartRate - oldVitals.heartRate) >= 1 ||
                Math.abs(newVitals.respRate - oldVitals.respRate) >= 1 ||
                Math.abs(newVitals.bloodPressureSys - oldVitals.bloodPressureSys) >= 1 ||
                Math.abs(newVitals.spo2 - oldVitals.spo2) >= 1 ||
                Math.abs(newVitals.temperature - oldVitals.temperature) >= 0.1;

            if (hasSignificantChange && userId) {
                try {
                    const simulationData = {
                        userId: parseInt(userId),
                        caseType,
                        stage: stage || 1,
                        vitals: newVitals as any,
                        interventions: [],
                        aiExplanations: [],
                        status: 'active' as const,
                        evidenceSources: [],
                        objectiveHits: [],
                        riskFlags: []
                    };

                    const simulation = await storage.createSimulation(simulationData);
                    simulationId = simulation.id.toString();
                } catch (dbError) {
                    console.warn('Failed to persist deterioration tick:', dbError);
                }
            }
        }

        res.json({
            updatedVitals: tickOutput.vitals,
            alerts: tickOutput.alerts,
            stage: stage || 1,
            ...(simulationId && { simulationId })
        });

    } catch (error) {
        console.error('Case tick error:', error);
        res.status(500).json({
            message: "Failed to process case tick",
            error: (error as Error).message
        });
    }
});

router.post('/simulate-case', async (req, res) => {
    try {
        const { caseType, intervention, userId, vitals, stage } = req.body;

        if (!caseType || !intervention || !userId) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const caseDefinition = caseBank.find(c => c.id === caseType);
        if (!caseDefinition) {
            return res.status(400).json({ message: "Invalid case type" });
        }

        let evidenceSources: any[] = [];
        let objectiveHits: any[] = [];
        let riskFlags: any[] = [];
        let explanation = '';
        let verdict = 'informational';
        let confidence = 0;
        let nextStageRecommendations: string[] = [];

        try {
            const { composeGroundedExplanation } = await import('../rag/compose');

            // Generate RAG response
            // We use a specific query format to trigger the intervention assessment mode in compose
            const query = `Analyze the intervention "${intervention}" for ${caseDefinition.name} at stage ${stage}`;
            const groundedBundle = await composeGroundedExplanation(
                query,
                caseType,
                stage || 1,
                userId.toString(),
                `sim_interv_${Date.now()}`,
                intervention // Pass intervention explicitly for specific checking
            );

            explanation = groundedBundle.explanation;
            evidenceSources = groundedBundle.evidenceSources;
            objectiveHits = groundedBundle.objectiveHits;
            riskFlags = groundedBundle.riskFlags;
            nextStageRecommendations = groundedBundle.nextStageRecommendations;
            verdict = groundedBundle.verdict || 'informational';
            confidence = groundedBundle.confidence || 0;

        } catch (ragError) {
            console.warn('RAG generation failed, falling back to guidelines:', ragError);
            explanation = `${intervention} is indicated for this stage based on PALS guidelines. Always assess airway, breathing, and circulation first.`;
            evidenceSources = ['PALS Guidelines 2020'];
            riskFlags = ['Monitor for adverse effects'];
        }

        let updatedVitals = { ...vitals };
        let nextStage = (stage || 1) + 1;
        let criticalActions = [];

        try {
            const { getCriticalActions, determineNextStage } = await import('../rules/rules');
            const criticalActionsResult = await getCriticalActions(caseType, stage || 1);
            criticalActions = criticalActionsResult;
            const nextStageResult = await determineNextStage(stage || 1, [], criticalActionsResult);
            nextStage = nextStageResult;

        } catch (rulesError) {
            console.warn('Rules service failed, using fallback:', rulesError);
            // Fallback logic for stage progression
            const currentStage = caseDefinition.stages.find(s => s.stage === (stage || 1));
            if (currentStage) {
                // Check branching conditions (legacy)
                for (const condition of currentStage.branchingConditions) {
                    if (intervention.includes(condition.condition) ||
                        condition.condition === 'complete') { // simplified check
                        nextStage = condition.nextStage;
                        if (condition.vitalsChange) Object.assign(updatedVitals, condition.vitalsChange);
                        break;
                    }
                }
            }
            criticalActions = caseDefinition.stages.find(s => s.stage === (stage || 1))?.criticalActions || [];
        }

        const simulationData = {
            userId,
            caseType,
            stage: nextStage,
            vitals: updatedVitals,
            interventions: [intervention],
            aiExplanations: [explanation],
            evidenceSources,
            objectiveHits,
            riskFlags,
            status: 'active' as const
        };

        const simulation = await storage.createSimulation(simulationData);
        const nextStageInfo = caseDefinition.stages.find(s => s.stage === nextStage);

        res.json({
            simulationId: simulation.id,
            updatedVitals,
            clinicalExplanation: explanation, // Use local var
            evidenceSources, // Use local var
            objectiveHits, // Use local var
            riskFlags, // Use local var
            nextStageRecommendations, // Use local var
            verdict, // New field from local var
            confidence, // New field from local var
            stage: nextStage,
            availableInterventions: nextStageInfo?.availableInterventions || [],
            timeLimit: nextStageInfo?.timeLimit,
            criticalActions,
            isCompleted: nextStage > caseDefinition.stages.length,
            license: "CC BY-NC-SA 4.0",
            sourceVersion: "aliem-rescu-peds-2021-03-29",
            attribution: "ALiEM EM ReSCu Peds - Pediatric Emergency Medicine Cases"
        });

    } catch (error) {
        console.error('Simulation error:', error);
        res.status(500).json({
            message: "Failed to process simulation",
            error: (error as Error).message
        });
    }
});

router.get('/simulation/:simulationId/debrief', async (req, res) => {
    try {
        const { simulationId } = req.params;

        if (!simulationId) {
            return res.status(400).json({ message: "Simulation ID required" });
        }

        const simulation = await storage.getSimulation(parseInt(simulationId));
        if (!simulation) {
            return res.status(404).json({ message: "Simulation not found" });
        }

        const caseDefinition = caseBank.find(c => c.id === simulation.caseType);
        if (!caseDefinition) {
            return res.status(404).json({ message: "Case definition not found" });
        }

        let debriefInsights: any = {
            objectives: [],
            evidenceSources: [],
            riskFlags: [],
            recommendations: [],
            clinicalReasoning: ""
        };

        try {
            const { composeGroundedExplanation } = await import('../rag/compose');
            const debriefQuery = `Generate a comprehensive debrief for ${caseDefinition.name} including learning objectives met, evidence-based interventions, risk factors identified, and recommendations for improvement.`;
            const debriefBundle = await composeGroundedExplanation(
                debriefQuery,
                simulation.caseType,
                simulation.stage,
                simulation.userId.toString(),
                `debrief_${simulationId}`
            );

            debriefInsights = {
                objectives: debriefBundle.objectiveHits,
                evidenceSources: debriefBundle.evidenceSources,
                riskFlags: debriefBundle.riskFlags,
                recommendations: debriefBundle.nextStageRecommendations,
                clinicalReasoning: debriefBundle.explanation
            };

        } catch (ragError) {
            console.warn('RAG debrief failed, using fallback:', ragError);

            const session: SimulationSession = {
                id: `debrief_${simulationId}`,
                userId: simulation.userId,
                caseId: simulation.caseType,
                startTime: new Date(),
                currentStage: simulation.stage,
                vitals: simulation.vitals as VitalSigns,
                appliedInterventions: (simulation.interventions as string[]) || [],
                timestamps: [],
                status: 'completed'
            };

            const feedback = evaluateSimulation(session, caseDefinition);

            debriefInsights = {
                objectives: (feedback.suggestions as string[]) || [],
                evidenceSources: [],
                riskFlags: [],
                recommendations: (feedback.suggestions as string[]) || [],
                clinicalReasoning: `Simulation completed with ${feedback.finalScore}% score. ${feedback.outcome}`
            };
        }

        res.json({
            simulationId,
            caseDefinition: {
                name: caseDefinition.name,
                category: caseDefinition.category,
                difficulty: caseDefinition.difficulty,
                learningObjectives: caseDefinition.learningObjectives,
                references: caseDefinition.references
            },
            simulation: {
                stage: simulation.stage,
                vitals: simulation.vitals as VitalSigns,
                interventions: simulation.interventions,
                status: simulation.status
            },
            debrief: debriefInsights,
            license: "CC BY-NC-SA 4.0",
            sourceVersion: "aliem-rescu-peds-2021-03-29",
            attribution: "ALiEM EM ReSCu Peds - Pediatric Emergency Medicine Cases"
        });

    } catch (error) {
        console.error('Debrief error:', error);
        res.status(500).json({
            message: "Failed to generate debrief",
            error: (error as Error).message
        });
    }
});

router.post('/evaluate-simulation', async (req, res) => {
    try {
        const { sessionId, caseId, appliedInterventions, timestamps } = req.body;

        if (!sessionId || !caseId || !appliedInterventions) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const caseDefinition = caseBank.find(c => c.id === caseId);
        if (!caseDefinition) {
            return res.status(400).json({ message: "Invalid case ID" });
        }

        const session: SimulationSession = {
            id: sessionId,
            userId: 1, // This would come from auth in real app
            caseId,
            startTime: new Date(),
            currentStage: caseDefinition.stages.length,
            vitals: (caseDefinition.initialVitals || { heartRate: 120, temperature: 98.6, respRate: 20, spo2: 98, bloodPressureSys: 90, bloodPressureDia: 60 }) as VitalSigns,
            appliedInterventions,
            timestamps: timestamps || [],
            status: 'completed'
        };

        const feedback = evaluateSimulation(session, caseDefinition);

        res.json({
            sessionId,
            feedback,
            caseDefinition: {
                name: caseDefinition.name,
                learningObjectives: caseDefinition.learningObjectives,
                references: caseDefinition.references
            }
        });

    } catch (error) {
        console.error('Evaluation error:', error);
        res.status(500).json({
            message: "Failed to evaluate simulation",
            error: (error as Error).message
        });
    }
});

router.get('/cases', async (req, res) => {
    try {
        res.json(caseBank);
    } catch (error) {
        console.error('Get all cases error:', error);
        res.status(500).json({ message: "Failed to fetch cases" });
    }
});

router.get('/cases/:caseId', async (req, res) => {
    try {
        const case_ = caseBank.find(c => c.id === req.params.caseId);
        if (!case_) {
            return res.status(404).json({ message: "Case not found" });
        }
        res.json(case_);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch case" });
    }
});

router.get('/cases/random/:count', async (req, res) => {
    try {
        const count = parseInt(req.params.count) || 3;
        const cases: CaseDefinition[] = [];
        const usedCategories = new Set<string>();

        while (cases.length < count && usedCategories.size < caseBank.length) {
            const randomCase = getRandomCase();
            if (!usedCategories.has(randomCase.category)) {
                cases.push(randomCase);
                usedCategories.add(randomCase.category);
            }
        }

        while (cases.length < count) {
            const randomCase = getRandomCase();
            if (!cases.find(c => c.id === randomCase.id)) {
                cases.push(randomCase);
            }
        }

        res.json(cases);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch random cases" });
    }
});

router.get('/cases/enhanced', async (req, res) => {
    try {
        const { category } = req.query;

        let availableCases = caseBank;
        if (category && typeof category === 'string') {
            availableCases = caseBank.filter(case_ => case_.category === category);
        }

        const enhancedCases = await Promise.all(
            availableCases.map(async (case_) => {
                try {
                    const { composeGroundedExplanation } = await import('../rag/compose');

                    const overviewQuery = `What are the key learning objectives and critical considerations for ${case_.name}?`;
                    const overviewBundle = await composeGroundedExplanation(
                        overviewQuery,
                        case_.id,
                        1,
                        'system',
                        'case-overview'
                    );

                    return {
                        ...case_,
                        enhancedObjectives: overviewBundle.objectiveHits,
                        riskFactors: overviewBundle.riskFlags,
                        evidenceLevel: overviewBundle.evidenceSources.length > 0 ? 'evidence-based' : 'guideline-based',
                        license: "CC BY-NC-SA 4.0",
                        sourceVersion: "aliem-rescu-peds-2021-03-29",
                        attribution: "ALiEM EM ReSCu Peds - Pediatric Emergency Medicine Cases"
                    };

                } catch (ragError) {
                    console.warn(`RAG enhancement failed for case ${case_.id}:`, ragError);
                    return {
                        ...case_,
                        enhancedObjectives: case_.learningObjectives || [],
                        riskFactors: [],
                        evidenceLevel: 'guideline-based',
                        license: "CC BY-NC-SA 4.0",
                        sourceVersion: "aliem-rescu-peds-2021-03-29",
                        attribution: "ALiEM EM ReSCu Peds - Pediatric Emergency Medicine Cases"
                    };
                }
            })
        );

        res.json(enhancedCases);

    } catch (error) {
        console.error('Enhanced cases error:', error);
        res.status(500).json({
            message: "Failed to fetch enhanced cases",
            error: (error as Error).message
        });
    }
});


// Get all available interventions (Optimized: Uses loaded ALIEM_CASES)
router.get('/interventions', async (req, res) => {
    try {
        const { stage, caseId } = req.query;

        if (stage && caseId) {
            // Return stage-specific interventions for a specific case
            try {
                const caseIdStr = String(caseId);
                console.log('🔍 Fetching interventions for caseId:', caseIdStr, 'stage:', stage);

                const targetCase = ALIEM_CASES.find((c: any) =>
                    c.id === caseIdStr || c.id === caseIdStr.replace(/_a$/, '') || c.id === caseIdStr.replace(/_b$/, '')
                );

                console.log('🔍 Found target case:', targetCase ? targetCase.id : 'NOT FOUND');

                if (targetCase && targetCase.variants && targetCase.variants[0]) {
                    const stageData = targetCase.variants[0].stages.find((s: any) => s.stage === parseInt(stage as string));

                    console.log('🔍 Found stage data:', stageData ? `Stage ${stageData.stage}` : 'NOT FOUND');

                    if (stageData) {
                        const stageInterventions: Record<string, any> = {};

                        (stageData.requiredInterventions || []).forEach((intervention: string, index: number) => {
                            stageInterventions[`required_${index}`] = {
                                id: `required_${index}`,
                                name: intervention,
                                description: `Required intervention: ${intervention}`,
                                category: 'medication',
                                timeRequired: 30,
                                successRate: 0.95,
                                ragSummary: `Critical intervention for Stage ${stage} anaphylaxis management`,
                                evidenceSources: ['PALS Guidelines 2020 - Anaphylaxis Management'],
                                vitalEffects: stageData.vitalEffects?.[intervention] || {}
                            };
                        });

                        (stageData.helpful || []).forEach((intervention: string, index: number) => {
                            stageInterventions[`helpful_${index}`] = {
                                id: `helpful_${index}`,
                                name: intervention,
                                description: `Helpful intervention: ${intervention}`,
                                category: 'monitoring',
                                timeRequired: 20,
                                successRate: 0.90,
                                ragSummary: `Beneficial intervention for Stage ${stage} anaphylaxis management`,
                                evidenceSources: ['PALS Guidelines 2020 - Anaphylaxis Management'],
                                vitalEffects: stageData.vitalEffects?.[intervention] || {}
                            };
                        });

                        (stageData.harmful || []).forEach((intervention: string, index: number) => {
                            stageInterventions[`harmful_${index}`] = {
                                id: `harmful_${index}`,
                                name: intervention,
                                description: `Harmful intervention: ${intervention}`,
                                category: 'medication',
                                timeRequired: 15,
                                successRate: 0.10,
                                ragSummary: `Avoid this intervention - it can worsen outcomes`,
                                evidenceSources: ['PALS Guidelines 2020 - Anaphylaxis Management'],
                                vitalEffects: {}
                            };
                        });

                        (stageData.neutral || []).forEach((intervention: string, index: number) => {
                            stageInterventions[`neutral_${index}`] = {
                                id: `neutral_${index}`,
                                name: intervention,
                                description: `Neutral intervention: ${intervention}`,
                                category: 'monitoring',
                                timeRequired: 25,
                                successRate: 0.95,
                                ragSummary: `Standard monitoring intervention`,
                                evidenceSources: ['PALS Guidelines 2020 - General Principles'],
                                vitalEffects: {}
                            };
                        });

                        console.log('🔍 Returning stage interventions:', Object.keys(stageInterventions));
                        return res.json(stageInterventions);
                    }
                }
            } catch (caseError) {
                console.log('Error getting stage-specific interventions:', caseError);
            }
        }

        // Fallback to all interventions if no stage/case specified or error occurred
        const { interventions } = await import('../caseBank');
        res.json(interventions);
    } catch (error) {
        console.error('Get interventions error:', error);
        res.status(500).json({ message: "Failed to fetch interventions" });
    }
});

export default router;
