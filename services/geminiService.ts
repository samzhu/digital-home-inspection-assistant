import { GoogleGenAI } from "@google/genai";

// Initialize Gemini
// Note: In a real PWA, allow user to input key or handle via proxy. 
// For this demo, we assume process.env.API_KEY is available or injected.
const apiKey = process.env.API_KEY || ''; 

const ai = new GoogleGenAI({ apiKey });

// Helper to convert Blob to Base64
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Transcribes audio blob to text using Gemini.
 */
export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  if (!apiKey) return "API Key missing";

  try {
    const base64Audio = await blobToBase64(audioBlob);

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', // Capable of multimodal (audio) processing
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: audioBlob.type || 'audio/webm',
              data: base64Audio
            }
          },
          {
            text: "Please transcribe this audio recording into Traditional Chinese text. Keep it concise. Do not add any conversational filler."
          }
        ]
      }
    });

    return response.text || "";
  } catch (error) {
    console.error("Transcription error:", error);
    throw new Error("Failed to transcribe audio.");
  }
};

/**
 * Analyzes an image to suggest a defect description.
 */
export const analyzeDefectImage = async (imageBlob: Blob): Promise<string> => {
  if (!apiKey) return "API Key missing";

  try {
    const base64Image = await blobToBase64(imageBlob);

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: imageBlob.type || 'image/jpeg',
              data: base64Image
            }
          },
          {
            text: "這是一張房屋驗收的照片。請分析照片中的瑕疵或潛在問題（例如裂縫、滲水、施工不良等）。請用繁體中文提供簡短、專業的缺失描述。"
          }
        ]
      }
    });

    return response.text || "";
  } catch (error) {
    console.error("Image analysis error:", error);
    throw new Error("Failed to analyze image.");
  }
};