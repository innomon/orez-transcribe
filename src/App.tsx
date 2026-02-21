import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  FileAudio, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Cloud, 
  LogOut,
  ChevronRight,
  FileText,
  ListTodo,
  Sparkles,
  Download,
  Key,
  Shield,
  ExternalLink,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import Markdown from 'react-markdown';
import { analyzeAudio, AudioAnalysis } from './services/geminiService';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
}

const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

export default function App() {
  const [userApiKey, setUserApiKey] = useState<string>(localStorage.getItem('gemini_api_key') || '');
  const [userClientId, setUserClientId] = useState<string>(localStorage.getItem('google_client_id') || '');
  const [showApiKeyScreen, setShowApiKeyScreen] = useState(!localStorage.getItem('gemini_api_key'));
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showDriveInstructions, setShowDriveInstructions] = useState(false);
  
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(localStorage.getItem('drive_access_token'));
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [isFetchingDrive, setIsFetchingDrive] = useState(false);
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [currentFileName, setCurrentFileName] = useState<string>('audio-analysis');
  const [showExportMenu, setShowExportMenu] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (accessToken) {
      fetchDriveFiles(accessToken);
    }

    // Handle OAuth callback if it happens in the same window (though we use popup)
    const params = new URLSearchParams(window.location.hash.substring(1));
    const token = params.get('access_token');
    if (token) {
      setAccessToken(token);
      localStorage.setItem('drive_access_token', token);
      window.history.replaceState({}, document.title, window.location.pathname);
      fetchDriveFiles(token);
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_TOKEN') {
        const token = event.data.token;
        setAccessToken(token);
        localStorage.setItem('drive_access_token', token);
        fetchDriveFiles(token);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const fetchDriveFiles = async (token: string) => {
    setIsFetchingDrive(true);
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=mimeType contains 'audio/' or mimeType contains 'video/mp4'&fields=files(id, name, mimeType, size)&pageSize=20`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.status === 401) {
        handleLogout();
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setDriveFiles(data.files || []);
      } else {
        throw new Error("Failed to fetch files from Google Drive");
      }
    } catch (err) {
      console.error("Failed to fetch drive files", err);
      setError("Failed to fetch files from Google Drive. Your session might have expired.");
    } finally {
      setIsFetchingDrive(false);
    }
  };

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (userApiKey.trim()) {
      localStorage.setItem('gemini_api_key', userApiKey.trim());
      if (userClientId.trim()) {
        localStorage.setItem('google_client_id', userClientId.trim());
      }
      setShowApiKeyScreen(false);
    }
  };

  const handleConnectDrive = () => {
    if (!userClientId) {
      setError("Google Client ID is not configured. Please provide it in the settings (Key icon).");
      return;
    }
    setShowDriveInstructions(true);
  };

  const startOAuthFlow = () => {
    if (!userClientId) {
      setError("Google Client ID is not configured.");
      setShowDriveInstructions(false);
      return;
    }

    const redirectUri = window.location.origin;
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${userClientId}&redirect_uri=${redirectUri}&response_type=token&scope=${SCOPES}&include_granted_scopes=true&state=drive_auth`;
    
    const authWindow = window.open(url, 'google_oauth', 'width=600,height=700');
    setShowDriveInstructions(false);
    
    const checkPopup = setInterval(() => {
      try {
        if (!authWindow || authWindow.closed) {
          clearInterval(checkPopup);
          return;
        }
        
        const hash = authWindow.location.hash;
        if (hash && hash.includes('access_token')) {
          const params = new URLSearchParams(hash.substring(1));
          const token = params.get('access_token');
          if (token) {
            setAccessToken(token);
            localStorage.setItem('drive_access_token', token);
            fetchDriveFiles(token);
            authWindow.close();
            clearInterval(checkPopup);
          }
        }
      } catch (e) {}
    }, 500);
  };

  const handleLogout = () => {
    setAccessToken(null);
    localStorage.removeItem('drive_access_token');
    setDriveFiles([]);
    setShowDrivePicker(false);
  };

  const handleResetApiKey = () => {
    localStorage.removeItem('gemini_api_key');
    localStorage.removeItem('google_client_id');
    setUserApiKey('');
    setUserClientId('');
    setShowApiKeyScreen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setCurrentFileName(e.target.files[0].name.split('.')[0]);
      setError(null);
      setAnalysis(null);
    }
  };

  const processFile = async (fileToProcess: File | { id: string, name: string, mimeType: string }) => {
    setIsAnalyzing(true);
    setError(null);
    if (!(fileToProcess instanceof File)) {
      setCurrentFileName(fileToProcess.name.split('.')[0]);
    }
    try {
      let base64Data = '';
      let mimeType = '';

      if (fileToProcess instanceof File) {
        mimeType = fileToProcess.type;
        base64Data = await fileToBase64(fileToProcess);
      } else {
        // Drive file
        if (!accessToken) throw new Error("Not authenticated with Google Drive");
        mimeType = fileToProcess.mimeType;
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileToProcess.id}?alt=media`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        if (!res.ok) throw new Error("Failed to download file from Google Drive");
        const blob = await res.blob();
        base64Data = await fileToBase64(new File([blob], fileToProcess.name, { type: mimeType }));
      }

      const result = await analyzeAudio(base64Data, mimeType, userApiKey);
      setAnalysis(result);
    } catch (err: any) {
      setError(err.message || "Failed to analyze audio");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleAnalyze = () => {
    if (file) {
      processFile(file);
    }
  };

  const handleSelectDriveFile = (driveFile: DriveFile) => {
    setShowDrivePicker(false);
    processFile(driveFile);
  };

  const exportAsTxt = () => {
    if (!analysis) return;
    const content = `AUDIO ANALYSIS: ${currentFileName}\n\nSUMMARY:\n${analysis.summary}\n\nACTION ITEMS:\n${analysis.actionItems.map(item => `- ${item}`).join('\n')}\n\nTRANSCRIPTION:\n${analysis.transcription}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentFileName}-analysis.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const exportAsCsv = () => {
    if (!analysis) return;
    const rows = [
      ['Section', 'Content'],
      ['Summary', analysis.summary],
      ['Action Items', analysis.actionItems.join('; ')],
      ['Transcription', analysis.transcription]
    ];
    const csvContent = rows.map(e => e.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentFileName}-analysis.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const exportAsPdf = () => {
    if (!analysis) return;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(79, 70, 229); // Indigo-600
    doc.text('AudioInsight AI Analysis', 20, 20);
    
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(`File: ${currentFileName}`, 20, 30);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 37);
    
    doc.setDrawColor(229, 231, 235);
    doc.line(20, 42, pageWidth - 20, 42);

    // Summary
    doc.setFontSize(14);
    doc.setTextColor(79, 70, 229);
    doc.text('Summary', 20, 52);
    doc.setFontSize(10);
    doc.setTextColor(31, 41, 55);
    const summaryLines = doc.splitTextToSize(analysis.summary, pageWidth - 40);
    doc.text(summaryLines, 20, 60);
    
    let currentY = 60 + (summaryLines.length * 5) + 10;

    // Action Items
    doc.setFontSize(14);
    doc.setTextColor(16, 185, 129); // Emerald-600
    doc.text('Actionable Items', 20, currentY);
    doc.setFontSize(10);
    doc.setTextColor(31, 41, 55);
    currentY += 8;
    analysis.actionItems.forEach((item) => {
      const itemLines = doc.splitTextToSize(`• ${item}`, pageWidth - 45);
      if (currentY + (itemLines.length * 5) > 280) {
        doc.addPage();
        currentY = 20;
      }
      doc.text(itemLines, 25, currentY);
      currentY += (itemLines.length * 5) + 2;
    });

    // Transcription
    if (currentY + 20 > 280) {
      doc.addPage();
      currentY = 20;
    } else {
      currentY += 10;
    }
    
    doc.setFontSize(14);
    doc.setTextColor(107, 114, 128); // Gray-500
    doc.text('Full Transcription', 20, currentY);
    doc.setFontSize(8);
    doc.setTextColor(75, 85, 99);
    currentY += 8;
    
    // Simple cleanup of markdown for PDF (stripping ** and * for basic readability)
    const cleanTranscription = analysis.transcription
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1');
      
    const transLines = doc.splitTextToSize(cleanTranscription, pageWidth - 40);
    
    // Handle multi-page transcription
    for (let i = 0; i < transLines.length; i++) {
      if (currentY > 280) {
        doc.addPage();
        currentY = 20;
      }
      doc.text(transLines[i], 20, currentY);
      currentY += 4;
    }

    doc.save(`${currentFileName}-analysis.pdf`);
    setShowExportMenu(false);
  };

  if (showApiKeyScreen) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white w-full max-w-md rounded-3xl shadow-xl p-8 border border-gray-100"
        >
          <div className="flex flex-col items-center text-center mb-8">
            <div className="bg-indigo-600 p-4 rounded-2xl mb-4 shadow-lg shadow-indigo-200">
              <Sparkles className="text-white w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Welcome to AudioInsight AI</h1>
            <p className="text-gray-500 mt-2">To get started, please provide your Gemini API Key.</p>
          </div>

          <form onSubmit={handleSaveApiKey} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <Key className="w-4 h-4 text-indigo-600" />
                Gemini API Key
              </label>
              <input 
                type="password"
                value={userApiKey}
                onChange={(e) => setUserApiKey(e.target.value)}
                placeholder="Enter your API key..."
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                required
              />
              <a 
                href="https://aistudio.google.com/app/apikey" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-indigo-600 hover:underline mt-2 inline-flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                Get your API key from Google AI Studio
              </a>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <Cloud className="w-4 h-4 text-indigo-600" />
                Google Client ID (Optional)
              </label>
              <input 
                type="text"
                value={userClientId}
                onChange={(e) => setUserClientId(e.target.value)}
                placeholder="Enter your Google Client ID..."
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
              />
              <p className="text-[10px] text-gray-400 mt-2">
                Required only if you want to use Google Drive integration.
              </p>
            </div>

            <button 
              type="submit"
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
            >
              Continue to App
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-100 text-center">
            <button 
              onClick={() => setShowTermsModal(true)}
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1 mx-auto"
            >
              <Shield className="w-3 h-3" />
              Terms and Conditions
            </button>
          </div>
        </motion.div>

        {/* Terms Modal */}
        <AnimatePresence>
          {showTermsModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowTermsModal(false)}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8 max-h-[80vh] overflow-y-auto"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Shield className="text-indigo-600 w-5 h-5" />
                    Terms and Conditions
                  </h2>
                  <button onClick={() => setShowTermsModal(false)} className="p-2 hover:bg-gray-100 rounded-full">
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
                <div className="prose prose-sm text-gray-600 space-y-4">
                  <p>By using AudioInsight AI, you agree to the following terms:</p>
                  <h3 className="font-bold text-gray-900">1. Data Privacy</h3>
                  <p>Your audio files are processed by Google's Gemini AI. We do not store your audio files or transcriptions on our servers. All processing happens in real-time.</p>
                  <h3 className="font-bold text-gray-900">2. API Usage & Security</h3>
                  <p>You are responsible for the usage and security of your own Gemini API key. Your key is stored locally in your browser and is only used to communicate directly with Google's APIs. We never transmit your key to any other third party.</p>
                  <h3 className="font-bold text-gray-900">3. Local Storage</h3>
                  <p>Your API key and Google Drive access tokens are stored in your browser's local storage for convenience. Clear your browser data to remove them.</p>
                  <h3 className="font-bold text-gray-900">4. Disclaimer</h3>
                  <p>AudioInsight AI is provided "as is" without warranties of any kind. AI-generated transcriptions and summaries may contain inaccuracies.</p>
                </div>
                <button 
                  onClick={() => setShowTermsModal(false)}
                  className="w-full mt-8 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all"
                >
                  Close
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#202124] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Sparkles className="text-white w-5 h-5" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">AudioInsight AI</h1>
        </div>
        
        <div className="flex items-center gap-4">
          {accessToken ? (
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setShowDrivePicker(!showDrivePicker)}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors text-sm font-medium"
              >
                <Cloud className="w-4 h-4" />
                Google Drive
              </button>
              <button 
                onClick={handleLogout}
                className="p-2 text-gray-500 hover:text-red-600 transition-colors"
                title="Logout Drive"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <button 
              onClick={handleConnectDrive}
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-gray-300 hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              <Cloud className="w-4 h-4" />
              Connect Drive
            </button>
          )}
          <button 
            onClick={handleResetApiKey}
            className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"
            title="Change API Key"
          >
            <Key className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Left Column: Upload & Controls */}
          <div className="lg:col-span-5 space-y-8">
            <section className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                <Upload className="w-5 h-5 text-indigo-600" />
                Upload Audio
              </h2>
              
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={`
                  border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all
                  ${file ? 'border-indigo-400 bg-indigo-50/30' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'}
                `}
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="audio/mp3,audio/wav,video/mp4,audio/mpeg"
                  className="hidden"
                />
                
                {file ? (
                  <div className="text-center">
                    <div className="bg-indigo-100 p-4 rounded-full inline-block mb-4">
                      <FileAudio className="w-8 h-8 text-indigo-600" />
                    </div>
                    <p className="font-medium text-gray-900 truncate max-w-[200px]">{file.name}</p>
                    <p className="text-sm text-gray-500 mt-1">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="bg-gray-100 p-4 rounded-full inline-block mb-4">
                      <Upload className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="font-medium text-gray-900">Click to upload</p>
                    <p className="text-sm text-gray-500 mt-1">MP3, WAV, MP4 supported</p>
                  </div>
                )}
              </div>

              <button
                disabled={!file || isAnalyzing}
                onClick={handleAnalyze}
                className={`
                  w-full mt-6 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all
                  ${!file || isAnalyzing 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200'}
                `}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Analyze Audio
                  </>
                )}
              </button>

              {error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 text-sm">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}
            </section>

            <section className="bg-indigo-900 text-white rounded-2xl p-8 shadow-xl">
              <h3 className="text-lg font-semibold mb-4">How it works</h3>
              <ul className="space-y-4 text-indigo-100 text-sm">
                <li className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-800 flex items-center justify-center text-xs font-bold shrink-0">1</div>
                  <p>Upload a local file or pick one from your Google Drive.</p>
                </li>
                <li className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-800 flex items-center justify-center text-xs font-bold shrink-0">2</div>
                  <p>Gemini AI processes the audio to transcribe and understand the context.</p>
                </li>
                <li className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-800 flex items-center justify-center text-xs font-bold shrink-0">3</div>
                  <p>Get a detailed transcription, a concise summary, and actionable next steps.</p>
                </li>
                <li className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-800 flex items-center justify-center text-xs font-bold shrink-0">4</div>
                  <p>Your API Key is saved locally in your browser for future sessions.</p>
                </li>
              </ul>
            </section>
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-7">
            <AnimatePresence mode="wait">
              {isAnalyzing ? (
                <motion.div 
                  key="loading"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-white rounded-2xl p-12 shadow-sm border border-gray-100 flex flex-col items-center justify-center min-h-[400px]"
                >
                  <div className="relative">
                    <div className="w-20 h-20 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                    <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-indigo-600" />
                  </div>
                  <h3 className="text-xl font-semibold mt-8 text-gray-900">Processing your audio</h3>
                  <p className="text-gray-500 mt-2 text-center max-w-xs">
                    Our AI is listening carefully to transcribe and summarize the content. This may take a minute.
                  </p>
                </motion.div>
              ) : analysis ? (
                <motion.div 
                  key="results"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  {/* Export Options */}
                  <div className="flex justify-end relative">
                    <button 
                      onClick={() => setShowExportMenu(!showExportMenu)}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl shadow-sm hover:bg-gray-50 transition-all text-sm font-medium text-gray-700"
                    >
                      <Download className="w-4 h-4" />
                      Export Analysis
                    </button>

                    <AnimatePresence>
                      {showExportMenu && (
                        <>
                          <div 
                            className="fixed inset-0 z-20" 
                            onClick={() => setShowExportMenu(false)} 
                          />
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="absolute top-full right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-30"
                          >
                            <button 
                              onClick={exportAsTxt}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex items-center gap-2"
                            >
                              <FileText className="w-4 h-4" />
                              Plain Text (.txt)
                            </button>
                            <button 
                              onClick={exportAsCsv}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex items-center gap-2"
                            >
                              <ListTodo className="w-4 h-4" />
                              Spreadsheet (.csv)
                            </button>
                            <button 
                              onClick={exportAsPdf}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex items-center gap-2"
                            >
                              <FileAudio className="w-4 h-4" />
                              Document (.pdf)
                            </button>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Summary Card */}
                  <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-2 mb-4 text-indigo-600">
                      <FileText className="w-5 h-5" />
                      <h3 className="font-semibold uppercase tracking-wider text-xs">Summary</h3>
                    </div>
                    <p className="text-gray-700 leading-relaxed text-lg">
                      {analysis.summary}
                    </p>
                  </div>

                  {/* Action Items Card */}
                  <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-2 mb-6 text-emerald-600">
                      <ListTodo className="w-5 h-5" />
                      <h3 className="font-semibold uppercase tracking-wider text-xs">Actionable Items</h3>
                    </div>
                    <div className="space-y-3">
                      {analysis.actionItems.map((item, idx) => (
                        <div key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-emerald-50/50 border border-emerald-100/50">
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                          <p className="text-gray-700">{item}</p>
                        </div>
                      ))}
                      {analysis.actionItems.length === 0 && (
                        <p className="text-gray-400 italic">No specific action items identified.</p>
                      )}
                    </div>
                  </div>

                  {/* Transcription Card */}
                  <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                    <div className="flex items-center gap-2 mb-4 text-gray-500">
                      <FileAudio className="w-5 h-5" />
                      <h3 className="font-semibold uppercase tracking-wider text-xs">Full Transcription</h3>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-6 max-h-[400px] overflow-y-auto">
                      <div className="prose prose-sm max-w-none text-gray-600 leading-relaxed font-sans">
                        <Markdown>{analysis.transcription}</Markdown>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="bg-white rounded-2xl p-12 shadow-sm border border-gray-100 flex flex-col items-center justify-center min-h-[400px] text-center">
                  <div className="bg-gray-50 p-6 rounded-full mb-6">
                    <FileAudio className="w-12 h-12 text-gray-300" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900">No audio analyzed yet</h3>
                  <p className="text-gray-500 mt-2 max-w-xs">
                    Upload a file or select one from Google Drive to get started with AI-powered insights.
                  </p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Google Drive Instructions Modal */}
      <AnimatePresence>
        {showDriveInstructions && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDriveInstructions(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-8"
            >
              <div className="flex items-center gap-3 mb-6">
                <Cloud className="w-6 h-6 text-indigo-600" />
                <h2 className="text-xl font-bold">Connect Google Drive</h2>
              </div>
              <div className="space-y-4 text-gray-600 text-sm mb-8">
                <p>To analyze files from your Drive, we need your permission to:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>View audio and video files in your Google Drive.</li>
                  <li>Download selected files for processing.</li>
                </ul>
                <p className="bg-indigo-50 p-3 rounded-lg text-indigo-700 text-xs">
                  <strong>Note:</strong> We only access the files you explicitly select for analysis. Your data is processed in real-time and not stored on our servers.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={startOAuthFlow}
                  className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all"
                >
                  Agree and Connect
                </button>
                <button 
                  onClick={() => setShowDriveInstructions(false)}
                  className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Google Drive Picker Modal */}
      <AnimatePresence>
        {showDrivePicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDrivePicker(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-indigo-50/50">
                <div className="flex items-center gap-3">
                  <Cloud className="w-6 h-6 text-indigo-600" />
                  <h2 className="text-xl font-bold">Select from Google Drive</h2>
                </div>
                <button 
                  onClick={() => setShowDrivePicker(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {isFetchingDrive ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
                    <p className="text-gray-500">Fetching your files...</p>
                  </div>
                ) : driveFiles.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2">
                    {driveFiles.map((file) => (
                      <button
                        key={file.id}
                        onClick={() => handleSelectDriveFile(file)}
                        className="flex items-center justify-between p-4 rounded-2xl hover:bg-indigo-50 transition-all text-left group border border-transparent hover:border-indigo-100"
                      >
                        <div className="flex items-center gap-4">
                          <div className="bg-indigo-100 p-3 rounded-xl group-hover:bg-white transition-colors">
                            <FileAudio className="w-6 h-6 text-indigo-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 truncate max-w-[300px]">{file.name}</p>
                            <p className="text-xs text-gray-500 uppercase tracking-wider mt-0.5">{file.mimeType.split('/')[1]}</p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-indigo-600 transition-colors" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <AlertCircle className="w-12 h-12 text-gray-200 mb-4" />
                    <p className="text-gray-500">No audio files found in your Drive.</p>
                  </div>
                )}
              </div>
              
              <div className="p-4 bg-gray-50 border-t border-gray-100 text-center">
                <p className="text-xs text-gray-400">Only audio and MP4 files are shown.</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

