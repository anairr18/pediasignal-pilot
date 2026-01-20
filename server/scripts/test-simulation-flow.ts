
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { composeGroundedExplanation } from '../rag/compose';

async function verifySimulationFlow() {
    console.log('🧪 VERIFYING SIMULATION RAG FLOW...');

    // Simulate user context
    const caseType = 'aliem_case_01_anaphylaxis';
    const stage = 1;
    const intervention = 'Check blood glucose';
    // Using an intervention that might not be in the vector DB to test robustness
    // Actually, let's use something plausible: "Dextrose" -> should trigger reasoning
    const testIntervention = "Dextrose IV";

    try {
        console.log(`\n➤ Simulating Intervention: "${testIntervention}"`);
        const query = `Analyze the intervention "${testIntervention}" for Anaphylaxis Case at stage ${stage}`;

        const start = Date.now();
        const bundle = await composeGroundedExplanation(
            query,
            caseType,
            stage,
            "1",
            "test_session_flow",
            testIntervention
        );
        const duration = Date.now() - start;

        console.log(`\n✅ RAG Response Generated in ${duration}ms`);
        console.log('--- STRUCTURE CHECK ---');
        console.log(`Verdict:      ${bundle.verdict}`);
        console.log(`Confidence:   ${bundle.confidence}`);
        console.log(`Explanation:  ${bundle.explanation.substring(0, 100)}...`);
        console.log(`Risk Flags:   ${bundle.riskFlags.length}`);

        if (bundle.fallback) {
            console.log('\n⚠️ Note: System used fallback (Expected if no OpenAI Key or Empty DB)');
        }

        if (bundle.verdict === 'informational' && !bundle.fallback) {
            console.log('⚠️ Verdict is generic. Check if prompt injection of verdict worked.');
        }

    } catch (err) {
        console.error('❌ FAILURE in Simulation Flow:', err);
        process.exit(1);
    }
}

verifySimulationFlow();
