
import { db } from '../db';
import { kbPassages } from '@shared/schema';
import { ALIEM_CASES } from '../caseBank.aliem';
import { generatePassageHash } from '../rag/security';
import { eq } from 'drizzle-orm';

async function seedRag() {
    console.log('🌱 Starting RAG Knowledge Base Seeding...');
    let totalPassages = 0;
    let errors = 0;

    for (const caseData of ALIEM_CASES) {
        console.log(`Processing case: ${caseData.displayName} (${caseData.id})`);

        // 1. Index Clinical History
        if (caseData.clinicalHistory) {
            await createPassage({
                caseId: caseData.id,
                stage: 0, // 0 for overview/background
                section: 'background',
                text: caseData.clinicalHistory,
                tags: ['clinical_history', 'background', caseData.category],
                sourceCitation: `${caseData.displayName} - Clinical History`,
                license: caseData.license
            });
        }

        // Process Variants (usually just one, 'A')
        for (const variant of caseData.variants) {
            // 2. Index Stages
            for (const stage of variant.stages) {
                // Index Stage Description/Reasoning
                await createPassage({
                    caseId: caseData.id,
                    stage: stage.stage,
                    section: 'clinical_reasoning',
                    text: `Stage ${stage.stage} (${stage.name}): ${stage.name}. Severity: ${stage.severity}.`,
                    tags: ['stage_info', `severity_${stage.severity}`, caseData.category],
                    sourceCitation: `${caseData.displayName} - Stage ${stage.stage}`,
                    license: caseData.license
                });

                // Index Critical Actions
                if (stage.requiredInterventions && stage.requiredInterventions.length > 0) {
                    const text = `Required Critical Actions for Stage ${stage.stage}: ${stage.requiredInterventions.join(', ')}.`;
                    await createPassage({
                        caseId: caseData.id,
                        stage: stage.stage,
                        section: 'critical_actions',
                        text: text,
                        tags: ['critical_actions', 'required', caseData.category],
                        sourceCitation: `${caseData.displayName} - Stage ${stage.stage} Requirements`,
                        license: caseData.license
                    });
                }

                // Index Contraindications (Harmful Actions)
                if (stage.harmful && stage.harmful.length > 0) {
                    const text = `Contraindicated/Harmful Actions for Stage ${stage.stage}: ${stage.harmful.join(', ')}. Avoid these interventions.`;
                    await createPassage({
                        caseId: caseData.id,
                        stage: stage.stage,
                        section: 'contraindications',
                        text: text,
                        tags: ['contraindication', 'harmful', 'pitfall', caseData.category],
                        sourceCitation: `${caseData.displayName} - Stage ${stage.stage} Contraindications`,
                        license: caseData.license
                    });
                }
            }
        }
    }

    console.log(`✅ Seeding Complete. Created ${totalPassages} passages. Errors: ${errors}`);
    process.exit(0);

    async function createPassage(data: {
        caseId: string;
        stage: number;
        section: string;
        text: string;
        tags: string[];
        sourceCitation: string;
        license: string;
    }) {
        try {
            const passageHash = generatePassageHash(data.text, data.caseId);

            // Check existence
            const existing = await db.select().from(kbPassages).where(eq(kbPassages.passageHash, passageHash));
            if (existing.length > 0) {
                return; // Skip duplicate
            }

            await db.insert(kbPassages).values({
                caseId: data.caseId,
                stage: data.stage,
                section: data.section as any,
                tags: data.tags,
                text: data.text,
                sourceCitation: data.sourceCitation,
                license: data.license,
                passageHash: passageHash,
                documentId: 'system_seed'
            });
            totalPassages++;
        } catch (err) {
            console.error(`Failed to seed passage for ${data.caseId}:`, err);
            errors++;
        }
    }
}

seedRag().catch(console.error);
