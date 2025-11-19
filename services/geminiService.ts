const OLLAMA_API_URL = 'http://127.0.0.1:11434/api/generate';
const OLLAMA_MODEL = 'gpt-oss:20b';

export class OllamaConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OllamaConnectionError";
  }
}

/**
 * A utility function to safely parse JSON from the model response.
 * Handles cases where the model wraps JSON in markdown code blocks.
 */
function safeJsonParse(text: string): any {
  const sanitized = text.trim()
    .replace(/^```json\s*/, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(sanitized);
  } catch (e) {
    console.error("Failed to parse JSON:", sanitized);
    return []; // Return empty array to prevent crashes
  }
}

/**
 * Helper function to call the Ollama API.
 */
async function callOllama(prompt: string, jsonMode: boolean = false): Promise<string> {
  try {
    const response = await fetch(OLLAMA_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        format: jsonMode ? 'json' : undefined,
        options: {
            temperature: 0.2, // Low temperature for more deterministic results
            num_ctx: 4096     // Ensure sufficient context window
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API Error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    if (!data || typeof data.response !== 'string') {
        throw new Error('Invalid response format from Ollama');
    }
    
    return data.response;
  } catch (error) {
    console.error("Ollama Connection Error:", error);
    
    if (error instanceof OllamaConnectionError) {
        throw error;
    }
    
    // Detect fetch/network errors which typically mean CORS or Server Down
    const isNetworkError = error instanceof TypeError || 
                           (error instanceof Error && (error.message.includes('fetch') || error.message.includes('Network')));

    if (isNetworkError) {
        throw new OllamaConnectionError(
            `Connection Failed: Could not reach Ollama at ${OLLAMA_API_URL}.\n\n` +
            `POSSIBLE CAUSES & FIXES:\n` +
            `1. Ollama is not running.\n` +
            `   -> Fix: Start Ollama in your terminal.\n\n` +
            `2. CORS is blocking the browser request.\n` +
            `   -> Fix: Run one of these commands to allow browser access:\n\n` +
            `   Mac/Linux:\n` +
            `   OLLAMA_ORIGINS="*" ollama serve\n\n` +
            `   Windows (PowerShell):\n` +
            `   $env:OLLAMA_ORIGINS="*"; ollama serve\n\n` +
            `   Windows (Command Prompt):\n` +
            `   set OLLAMA_ORIGINS=* && ollama serve\n\n` +
            `3. The model '${OLLAMA_MODEL}' is not pulled.\n` +
            `   -> Fix: Run: ollama pull ${OLLAMA_MODEL}`
        );
    }
    
    throw new Error(
      `Failed to connect to Ollama: ${(error as Error).message}`
    );
  }
}

/**
 * Iterates through pages of a document and asks the local AI to identify and extract
 * self-contained, logical sections from each page.
 * @param documentPages An array of strings, where each string is a page of the document.
 * @returns A promise that resolves to an array of all extracted section strings.
 */
export async function extractSectionsFromDocument(documentPages: string[]): Promise<string[]> {
  const allSections: string[] = [];
  
  for (const page of documentPages) {
    const prompt = `
      Analyze the following page of a document. Identify and extract all distinct, self-contained logical sections or requirements from this text.
      Return a valid JSON array of strings, where each string is the exact text of a section you found.
      If no complete sections are found on this page, return an empty array [].

      Document Page:
      ---
      ${page}
      ---
    `;
    
    try {
        // Use JSON mode for structured extraction
        const responseText = await callOllama(prompt, true);
        const sectionsOnPage = safeJsonParse(responseText);
        
        if (Array.isArray(sectionsOnPage)) {
            allSections.push(...sectionsOnPage);
        }
    } catch(error) {
        // Propagate connection errors so the UI shows the helpful message
        if (error instanceof OllamaConnectionError) {
            throw error;
        }
        console.warn("Skipping a page due to an error during section extraction:", error);
    }
  }

  return allSections;
}

/**
 * Given a single RFP section, intelligently searches through proposal pages to find and extract the corresponding answer.
 * Uses a two-step "search then extract" process to handle large proposal documents efficiently.
 * @param rfpSection The specific RFP section to find a match for.
 * @param proposalPages An array of strings, representing the pages of the proposal document.
 * @returns A promise that resolves to the matched proposal section string, or null if no match is found.
 */
export async function findMatchingSection(rfpSection: string, proposalPages: string[]): Promise<string | null> {
  const relevantPages: string[] = [];

  // Step 1: Search - Find relevant pages in the proposal
  for (const page of proposalPages) {
    const prompt = `
      RFP Requirement: "${rfpSection}"
      
      Proposal Text Snippet: "${page}"
      
      Does the Proposal Text Snippet likely contain the specific answer to the RFP Requirement?
      Respond with only "YES" or "NO".
    `;
    
    try {
      const responseText = await callOllama(prompt, false);
      if (responseText.trim().toUpperCase().includes('YES')) {
        relevantPages.push(page);
      }
    } catch (error) {
        // Propagate connection errors
        if (error instanceof OllamaConnectionError) {
            throw error;
        }
        console.warn("Skipping a page during relevance check due to an error:", error);
    }
  }

  if (relevantPages.length === 0) {
    return null; // No relevant pages found
  }

  // Step 2: Extract - Use the relevant pages to find the exact answer
  const combinedRelevantText = relevantPages.join('\n\n---\n\n');
  const extractionPrompt = `
    You will be given a specific requirement from an RFP and a block of relevant text from a proposal.
    Your task is to extract the single, complete, and exact section from the proposal text that directly answers the RFP requirement.
    Return only the text of the proposal section, with no extra commentary.

    RFP Requirement:
    ---
    ${rfpSection}
    ---

    Relevant Proposal Text:
    ---
    ${combinedRelevantText}
    ---
  `;

  try {
    const responseText = await callOllama(extractionPrompt, false);
    return responseText.trim() || null;
  } catch (error) {
    // Propagate connection errors
    if (error instanceof OllamaConnectionError) {
        throw error;
    }
    console.error("Error during final extraction:", error);
    return null;
  }
}