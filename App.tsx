import React, { useState, useMemo } from 'react';
import { AppStep, FileContent, DocumentPair } from './types';
import Header from './components/Header';
import Stepper from './components/Stepper';
import { SparklesIcon, ArrowPathIcon, DownloadIcon, TrashIcon, PlusIcon } from './components/icons/Icons';
import Loader from './components/Loader';
import * as pdfjsLib from 'pdfjs-dist';
import { extractSectionsFromDocument, findMatchingSection } from './services/geminiService';

// Make mammoth available in the module scope
declare const mammoth: any;

// Configure PDF.js worker to enable PDF parsing
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.3.136/build/pdf.worker.min.mjs`;

const readFileContent = (file: File): Promise<FileContent> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const extension = file.name.split('.').pop()?.toLowerCase();

    reader.onload = async (event) => {
      try {
        if (!event.target?.result) {
            return reject(new Error('File could not be read.'));
        }
        
        let content = '';
        const result = event.target.result;

        switch (extension) {
          case 'txt':
          case 'md':
            content = result as string;
            break;

          case 'html':
            const doc = new DOMParser().parseFromString(result as string, 'text/html');
            content = doc.body.textContent || '';
            break;

          case 'doc':
          case 'docx':
            const docxResult = await mammoth.extractRawText({ arrayBuffer: result as ArrayBuffer });
            content = docxResult.value;
            break;

          case 'pdf':
            const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(result as ArrayBuffer) }).promise;
            const textPromises = [];
            for (let i = 1; i <= pdfDoc.numPages; i++) {
                textPromises.push(pdfDoc.getPage(i).then(page => page.getTextContent()));
            }
            const textContents = await Promise.all(textPromises);
            content = textContents.map(textContent => 
                textContent.items.map(item => ('str' in item ? item.str : '')).join(' ')
            ).join('\n');
            break;

          default:
            console.warn(`Unsupported file type: .${extension}. Trying to read as text.`);
            content = "Unsupported file type.";
        }
        resolve({ name: file.name, content: content.trim() });
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        reject(new Error(`Failed to process file: ${file.name}`));
      }
    };

    reader.onerror = (error) => reject(error);

    if (extension === 'doc' || extension === 'docx' || extension === 'pdf') {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  });
};

const triggerDownload = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

const textToPages = (text: string, chunkSize: number): string[] => {
    const pages = [];
    for (let i = 0; i < text.length; i += chunkSize) {
        pages.push(text.substring(i, i + chunkSize));
    }
    return pages;
};

const PAGE_CHUNK_SIZE = 10000; // 10,000 characters per page

export default function App() {
  const [step, setStep] = useState<AppStep>(AppStep.Upload);
  const [documentPairs, setDocumentPairs] = useState<DocumentPair[]>([{ id: Date.now(), rfp: [], proposal: null }]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [generatedEntries, setGeneratedEntries] = useState(0);

  const completedPairs = useMemo(() => documentPairs.filter(p => p.rfp.length > 0 && p.proposal), [documentPairs]);

  const handlePairChange = (id: number, type: 'rfp' | 'proposal', files: FileList | null) => {
    setDocumentPairs(pairs => pairs.map(p => {
        if (p.id === id) {
            if (type === 'rfp') {
                return { ...p, rfp: files ? Array.from(files) : [] };
            } else { // proposal
                return { ...p, proposal: files ? files[0] : null };
            }
        }
        return p;
    }));
  };

  const addPair = () => {
    setDocumentPairs(pairs => [...pairs, { id: Date.now(), rfp: [], proposal: null }]);
  };

  const removePair = (id: number) => {
    setDocumentPairs(pairs => pairs.filter(p => p.id !== id));
  };

  const handleGenerateJsonl = async () => {
    if (completedPairs.length === 0) {
      setError('Please provide at least one complete RFP and Proposal pair.');
      return;
    }
    setError(null);
    setIsLoading(true);

    try {
        const allFinalChunks: { rfp_section: string; proposal_section: string; }[] = [];

        for (const [index, pair] of completedPairs.entries()) {
            setLoadingMessage(`Processing pair ${index + 1} of ${completedPairs.length}: Reading files...`);
            
            const rfpContents = await Promise.all(
              pair.rfp.map(file => readFileContent(file))
            );
            const combinedRfpContent = rfpContents.map(c => `--- RFP File: ${c.name} ---\n${c.content}`).join('\n\n');
            
            const proposalContent = await readFileContent(pair.proposal!);
            
            // Step 1: Pre-chunk documents into manageable pages
            setLoadingMessage(`Processing pair ${index + 1}: Splitting documents into pages...`);
            const rfpPages = textToPages(combinedRfpContent, PAGE_CHUNK_SIZE);
            const proposalPages = textToPages(proposalContent.content, PAGE_CHUNK_SIZE);

            // Step 2: Iteratively extract logical sections from the RFP
            setLoadingMessage(`Processing pair ${index + 1}: Extracting requirements from RFP...`);
            const rfpSections = await extractSectionsFromDocument(rfpPages);
            if (rfpSections.length === 0) {
                console.warn(`No RFP sections found for pair ${index + 1}. Skipping.`);
                continue;
            }

            // Step 3: For each RFP section, find the matching proposal section
            for (const [sectionIndex, rfpSection] of rfpSections.entries()) {
                setLoadingMessage(`Processing pair ${index + 1}: Matching proposal for RFP section ${sectionIndex + 1} of ${rfpSections.length}...`);
                const proposalSection = await findMatchingSection(rfpSection, proposalPages);

                if (proposalSection) {
                    allFinalChunks.push({ rfp_section: rfpSection, proposal_section: proposalSection });
                }
            }
        }


        if (allFinalChunks.length === 0) {
            setError("The AI model could not extract any valid sections from your documents. Please check the document content and try again.");
            setIsLoading(false);
            return;
        }

        const jsonlContent = allFinalChunks.map(chunk => {
            const entry = {
              messages: [
                { role: "user", content: `Write a proposal section based on this RFP section:\n\n${chunk.rfp_section}` },
                { role: "assistant", content: chunk.proposal_section }
              ]
            };
            return JSON.stringify(entry);
        });
      
      const blob = new Blob([jsonlContent.join('\n')], { type: 'application/jsonl' });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setGeneratedEntries(jsonlContent.length);
      triggerDownload(url, 'finetune_dataset.jsonl');
      setStep(AppStep.Download);

    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'An unknown error occurred during file processing.');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  const handleReset = () => {
    setStep(AppStep.Upload);
    setDocumentPairs([{ id: Date.now(), rfp: [], proposal: null }]);
    setError(null);
    setIsLoading(false);
    setGeneratedEntries(0);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
  };

  const renderFileInput = (id: number, type: 'rfp' | 'proposal', files: File[] | File | null) => {
    const isRfp = type === 'rfp';
    const currentFiles = Array.isArray(files) ? files : (files ? [files] : []);

    const label = isRfp ? 'RFP(s)' : 'Proposal';
    const inputId = `${type}-${id}`;

    let buttonText: string;
    if (currentFiles.length === 0) {
        buttonText = `Select ${label} File(s)`;
    } else if (currentFiles.length === 1) {
        buttonText = currentFiles[0].name;
    } else {
        buttonText = `${currentFiles.length} RFP files selected`;
    }

    return (
        <div className="flex-1">
            <label htmlFor={inputId} className="w-full text-center cursor-pointer bg-secondary hover:bg-gray-600 text-text-primary font-semibold py-2 px-4 rounded-md transition-colors duration-200 block truncate">
                {buttonText}
            </label>
            <input
                id={inputId}
                type="file"
                multiple={isRfp}
                accept=".txt,.md,.pdf,.doc,.docx,.html"
                className="sr-only"
                onChange={(e) => handlePairChange(id, type, e.target.files)}
            />
        </div>
    );
  };

  const renderContent = () => {
    if (isLoading) {
      return <Loader message={loadingMessage || "Analyzing documents and generating dataset..."} />;
    }

    switch (step) {
      case AppStep.Upload:
        return (
          <div className="w-full max-w-4xl mx-auto space-y-8">
            <div className="bg-card p-6 rounded-lg border border-border space-y-4">
              <h3 className="text-xl font-bold text-text-primary">Upload Document Pairs</h3>
              <p className="text-sm text-text-secondary">For each entry, upload one or more RFP files and the single corresponding Proposal file. Accepted formats: .txt, .md, .pdf, .docx, .html.</p>
              <div className="space-y-3">
                {documentPairs.map((pair, index) => (
                  <div key={pair.id} className="flex items-center gap-3 p-3 bg-gray-900 rounded-md">
                    <span className="font-mono text-sm text-gray-400">{index + 1}.</span>
                    {renderFileInput(pair.id, 'rfp', pair.rfp)}
                    {renderFileInput(pair.id, 'proposal', pair.proposal)}
                    <button onClick={() => removePair(pair.id)} disabled={documentPairs.length <= 1} className="p-2 text-gray-400 hover:text-red-400 disabled:opacity-30 disabled:hover:text-gray-400">
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={addPair} className="flex items-center gap-2 text-sm font-semibold text-accent hover:text-emerald-400 transition-colors">
                <PlusIcon className="w-5 h-5"/>
                Add Another Pair
              </button>
            </div>

            {error && (
              <div className="text-left text-red-300 whitespace-pre-wrap bg-red-900/20 p-4 rounded-lg border border-red-800 font-mono text-sm shadow-sm">
                {error}
              </div>
            )}
            <div className="text-center">
              <button
                onClick={handleGenerateJsonl}
                disabled={completedPairs.length === 0}
                className="bg-primary hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-8 rounded-lg transition-colors duration-300 text-lg shadow-lg flex items-center gap-2 mx-auto"
              >
                <SparklesIcon className="w-6 h-6" />
                Generate JSONL File
              </button>
            </div>
          </div>
        );
      
      case AppStep.Download:
        return (
          <div className="w-full max-w-2xl mx-auto text-center space-y-6 bg-card p-8 rounded-lg border border-border shadow-xl">
            <h3 className="text-2xl font-bold text-emerald-400">Generation Complete!</h3>
            <p className="text-text-secondary">Your fine-tuning dataset with {generatedEntries} entries has been successfully created from {completedPairs.length} document pair(s).</p>
            <div className="flex justify-center items-center gap-4 pt-4">
              <button
                  onClick={() => downloadUrl && triggerDownload(downloadUrl, 'finetune_dataset.jsonl')}
                  className="bg-primary hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors duration-300 text-base shadow-lg flex items-center gap-2"
              >
                  <DownloadIcon className="w-5 h-5" />
                  Download Again
              </button>
              <button
                  onClick={handleReset}
                  className="bg-secondary hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg transition-colors duration-300 text-base shadow-lg flex items-center gap-2"
              >
                  <ArrowPathIcon className="w-5 h-5" />
                  Start Over
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background font-sans">
      <div className="container mx-auto px-4 py-8">
        <Header />
        <Stepper currentStep={step} />
        <main className="mt-12">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}