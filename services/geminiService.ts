import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { AspectRatio, ImageResolution } from "../types";

// Helpers
const base64ToGenerativePart = (base64String: string, mimeType: string = 'image/png') => {
  return {
    inlineData: {
      data: base64String.replace(/^data:image\/\w+;base64,/, ""),
      mimeType
    }
  };
};

/**
 * Generate Image using specified model
 */
export const generateImage = async (
  prompt: string,
  aspectRatio: AspectRatio,
  imageSize: ImageResolution,
  model: 'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview' = 'gemini-2.5-flash-image'
): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const config: any = {
      imageConfig: {
        aspectRatio: aspectRatio,
      },
    };

    // imageSize is only supported for gemini-3 series
    if (model === 'gemini-3-pro-image-preview') {
      config.imageConfig.imageSize = imageSize;
    }

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [{ text: prompt }],
      },
      config: config,
    });

    const images: string[] = [];
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          images.push(`data:image/png;base64,${part.inlineData.data}`);
        }
      }
    }
    return images;
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
};

/**
 * Edit Image using Nano Banana (gemini-2.5-flash-image)
 */
export const editImage = async (
  imageBase64: string,
  prompt: string
): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const imagePart = base64ToGenerativePart(imageBase64);
    
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          imagePart,
          { text: prompt }
        ],
      },
    });

    const images: string[] = [];
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          images.push(`data:image/png;base64,${part.inlineData.data}`);
        }
      }
    }
    return images;
  } catch (error) {
    console.error("Error editing image:", error);
    throw error;
  }
};