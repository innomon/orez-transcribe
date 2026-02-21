import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

export interface AudioAnalysis {
  transcription: string;
  summary: string;
  actionItems: string[];
}

export async function analyzeAudio(fileData: string, mimeType: string, apiKey: string): Promise<AudioAnalysis> {
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    Please analyze this audio file. 
    1. Provide a full transcription. Use Markdown formatting for the transcription (e.g., use bold for speaker names like **Speaker 1:**, use line breaks between speakers, and use italics for emphasis or non-verbal cues).
    2. Provide a concise summary of the key points.
    3. Extract a list of actionable items or next steps.
    
    Return the response in JSON format with the following structure:
    {
      "transcription": "...",
      "summary": "...",
      "actionItems": ["item 1", "item 2", ...]
    }
  `;

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          {
            inlineData: {
              data: fileData,
              mimeType: mimeType
            }
          },
          {
            text: prompt
          }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json"
    }
  });

  try {
    const result = JSON.parse(response.text || "{}");
    return {
      transcription: result.transcription || "No transcription available.",
      summary: result.summary || "No summary available.",
      actionItems: result.actionItems || []
    };
  } catch (e) {
    console.error("Error parsing Gemini response:", e);
    return {
      transcription: response.text || "Error processing transcription.",
      summary: "Error processing summary.",
      actionItems: []
    };
  }
}
