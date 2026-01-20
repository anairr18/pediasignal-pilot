import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key"
});

interface VitalsData {
  heartRate: number;
  temperature: number;
  respRate: number;
  bloodPressure?: string;
  oxygenSat?: number;
}

interface SimulationData {
  caseType: string;
  stage: number;
  vitals: VitalsData;
  intervention: string;
}

export async function generateClinicalExplanation(simulationData: SimulationData): Promise<{
  explanation: string;
  updatedVitals: VitalsData;
  nextStageRecommendations: string[];
}> {
  try {
    const prompt = `
You are an expert pediatric emergency medicine physician providing clinical explanations for medical training simulations.

Case: ${simulationData.caseType}
Current Stage: ${simulationData.stage}
Current Vitals: ${JSON.stringify(simulationData.vitals)}
Applied Intervention: ${simulationData.intervention}

Please provide:
1. A clinical explanation of the intervention's effects
2. Updated vital signs after the intervention
3. Recommendations for next steps

Respond in JSON format with: explanation, updatedVitals, nextStageRecommendations
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a pediatric emergency medicine expert providing training explanations. Always prioritize patient safety and evidence-based medicine."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");

    return {
      explanation: result.explanation || "Unable to generate explanation",
      updatedVitals: result.updatedVitals || simulationData.vitals,
      nextStageRecommendations: result.nextStageRecommendations || []
    };
  } catch (error) {
    console.error("OpenAI API error:", error);
    throw new Error("Failed to generate clinical explanation: " + (error as Error).message);
  }
}

