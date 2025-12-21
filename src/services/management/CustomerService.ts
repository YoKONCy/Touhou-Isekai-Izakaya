import { generateCompletion } from '@/services/llm';
import type { Customer, CookingSession } from '@/types/management';

const JUDGING_PROMPT = `
You are the judge of a dish in a Touhou-themed Izakaya.
Your task is to evaluate the dish served to a customer and determine their reaction, payment, and reputation gain.

**Input Data:**
- Customer Name: {customerName}
- Customer Dialogue/Context: {customerContext}
- Dish Name: {dishName}
- Ingredients: {ingredients} (Format: Name, Cooked Time, Sequence)
- Total Cooking Time: {totalTime}s
- Heat/Doneness: {heat} (Phase: {phase})
- Customer Requirement: {requirement}

**Evaluation Criteria:**
1. Does the dish match the customer's requirement? (Critical)
2. Is the cooking time and heat appropriate? (e.g. Raw meat is bad, Burnt is bad)
3. Do the ingredients make sense together? (Creative combos can be good or bad)

**Output Format:**
Return ONLY a JSON object:
{
  "score": number, // 0-100
  "comment": "string", // A short reaction from the customer (in character)
  "payment": number, // Amount to pay (base price + tip)
  "reputation": number, // Reputation change (-10 to +20)
  "isDelicious": boolean
}
`;

const DIALOGUE_PROMPT = `
You are writing dialogue for a Touhou Project character visiting an Izakaya.
Character: {name}
Context: {context}

Generate a short, in-character greeting or murmur as they enter or sit down.
If they have a specific request for food, include it subtly.

Return ONLY the dialogue string (no quotes needed around the whole text).
`;

export async function evaluateDish(
  customer: Customer, 
  dish: CookingSession, 
  context: string = ""
): Promise<{ score: number; comment: string; payment: number; reputation: number; isDelicious: boolean }> {
  try {
    const ingredientsDesc = dish.ingredients.map(i => 
      `${i.ingredient.name} (Cooked ${i.cookedDuration}s, Order ${i.sequence})`
    ).join(', ');

    const prompt = JUDGING_PROMPT
      .replace('{customerName}', customer.name)
      .replace('{customerContext}', customer.dialogue || context || "Regular customer")
      .replace('{dishName}', dish.dishName)
      .replace('{ingredients}', ingredientsDesc)
      .replace('{totalTime}', dish.totalDuration.toString())
      .replace('{heat}', dish.accumulatedHeat.toString())
      .replace('{phase}', dish.finalPhase)
      .replace('{requirement}', customer.order?.dishName || "Something tasty");

    const response = await generateCompletion({
      modelType: 'logic',
      systemPrompt: "You are a culinary judge and roleplay engine.",
      messages: [{ role: 'user', content: prompt }],
      jsonMode: true,
      temperature: 0.7
    });

    return JSON.parse(response);
  } catch (error) {
    console.error("Evaluation failed", error);
    return {
      score: 50,
      comment: "It's... okay.",
      payment: 100,
      reputation: 0,
      isDelicious: false
    };
  }
}

export async function generateCustomerDialogue(name: string, context: string): Promise<string> {
  try {
    const prompt = DIALOGUE_PROMPT
      .replace('{name}', name)
      .replace('{context}', context);

    const response = await generateCompletion({
      modelType: 'chat',
      systemPrompt: "You are a Touhou Project character roleplay engine.",
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8
    });

    return response.trim();
  } catch (error) {
    console.error("Dialogue generation failed", error);
    return "...";
  }
}
