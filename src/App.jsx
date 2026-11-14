import React, { useState } from 'react';
import StudentForm from './components/StudentForm';
import PDFUploader from './components/PDFUploader';
import Loading from './components/Loading';
import EvaluationResult from './components/EvaluationResult';
import GetAnswers from './components/GetAnswers';
import { extractTextFromPDF } from './services/pdfService';
import { evaluateAnswerSheet } from './services/evaluationService';
import './styles/App.css';

export default function App() {
  const [activeTab, setActiveTab] = useState('evaluate'); // 'evaluate' | 'get-answers'

  const [studentName, setStudentName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState('');
  const [retryAfter, setRetryAfter] = useState(null);
  const [fileError, setFileError] = useState('');
  const [evaluationResult, setEvaluationResult] = useState(null);

  const handleFileSelect = (file) => {
    setFileError('');
    setError('');
    setRetryAfter(null);

    if (!file) return;

    if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setFileError('Invalid file type. Please upload a standard PDF file.');
      return;
    }

    const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
    if (file.size > MAX_SIZE) {
      setFileError('File size exceeds the 10 MB maximum limit.');
      return;
    }

    setSelectedFile(file);
  };

  const handleFileRemove = () => {
    setSelectedFile(null);
    setFileError('');
  };

  const handleReset = () => {
    setStudentName('');
    setStudentId('');
    setSelectedFile(null);
    setError('');
    setRetryAfter(null);
    setFileError('');
    setEvaluationResult(null);
  };

  const handleEvaluateAnother = () => {
    setSelectedFile(null);
    setError('');
    setRetryAfter(null);
    setFileError('');
    setEvaluationResult(null);
  };

  const handleEvaluate = async (e) => {
    if (e && e.preventDefault) {
      e.preventDefault();
    }

    if (isLoading) return; // Prevent duplicate submissions

    setError('');
    setRetryAfter(null);
    setFileError('');

    // Field Validations
    if (!studentName.trim()) {
      setError('Please enter the Student Full Name.');
      return;
    }

    if (!studentId.trim()) {
      setError('Please enter the Student ID / Roll Number.');
      return;
    }

    if (!selectedFile) {
      setFileError('Please select or drop an answer-sheet PDF.');
      return;
    }

    try {
      setIsLoading(true);
      setLoadingMessage('Extracting text from answer-sheet PDF in memory...');

      // 1. In-browser memory extraction with PDF.js
      const extractedText = await extractTextFromPDF(selectedFile);

      setLoadingMessage('AI is reviewing answers with multi-provider fallback (OpenRouter, Gemini, Groq)...');

      // 2. Call serverless API with extracted text
      const result = await evaluateAnswerSheet({
        studentName,
        studentId,
        extractedText,
      });

      setEvaluationResult(result);
    } catch (err) {
      console.error('Evaluation Error:', err);
      setError(err.message || 'An unexpected error occurred during evaluation.');
      if (err.retryAfter) {
        setRetryAfter(err.retryAfter);
      }
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  return (
    <div className="app-wrapper">
      {/* App Header */}
      <header className="app-header">
        <p className="app-eyebrow">AI EXAMINATION SUITE</p>
        <h1 className="app-title">
          {activeTab === 'evaluate' ? 'Answer Sheet Evaluator' : 'AI Question Paper Solver'}
        </h1>
        <p className="app-subtitle">
          {activeTab === 'evaluate'
            ? 'Upload a multiple-choice answer sheet to review responses and see the calculated score.'
            : 'Upload a multiple-choice question paper to generate verified correct answers and explanations.'}
        </p>

        {/* Feature Navigation Tabs */}
        <div className="app-tab-nav" style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button
            type="button"
            className={`btn ${activeTab === 'evaluate' ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              padding: '0.6rem 1.25rem',
              borderRadius: '7px',
              fontSize: '0.95rem',
              fontWeight: '600',
              cursor: 'pointer',
              border: activeTab === 'evaluate' ? 'none' : '1px solid #dce1e4',
              backgroundColor: activeTab === 'evaluate' ? '#365f73' : '#ffffff',
              color: activeTab === 'evaluate' ? '#ffffff' : '#26313a'
            }}
            onClick={() => setActiveTab('evaluate')}
          >
            Evaluate Answer Sheet
          </button>
          <button
            type="button"
            className={`btn ${activeTab === 'get-answers' ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              padding: '0.6rem 1.25rem',
              borderRadius: '7px',
              fontSize: '0.95rem',
              fontWeight: '600',
              cursor: 'pointer',
              border: activeTab === 'get-answers' ? 'none' : '1px solid #dce1e4',
              backgroundColor: activeTab === 'get-answers' ? '#365f73' : '#ffffff',
              color: activeTab === 'get-answers' ? '#ffffff' : '#26313a'
            }}
            onClick={() => setActiveTab('get-answers')}
          >
            Get Answers
          </button>
        </div>
      </header>

      {/* Feature 1: Evaluate Answer Sheet */}
      {activeTab === 'evaluate' && (
        <>
          {/* Global Error Banner */}
          {error && (
            <div className="error-banner" role="alert" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span>{error}</span>
              {retryAfter && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
                  <span style={{ fontSize: '0.85rem' }}>Estimated cooldown: {retryAfter}s</span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '0.3rem 0.75rem', fontSize: '0.85rem' }}
                    onClick={handleEvaluate}
                    disabled={isLoading}
                  >
                    Retry Now
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Main Content Area */}
          {isLoading ? (
            <Loading message={loadingMessage} />
          ) : evaluationResult ? (
            <div>
              {evaluationResult.providerUsed && (
                <div style={{
                  marginBottom: '1rem',
                  fontSize: '0.85rem',
                  color: 'var(--text-muted, #69747d)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  background: '#f8f9fa',
                  padding: '0.5rem 0.85rem',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  width: 'fit-content'
                }}>
                  <span>Evaluated via: <strong>{evaluationResult.providerUsed}</strong></span>
                  {evaluationResult.modelUsed && <span>({evaluationResult.modelUsed})</span>}
                </div>
              )}
              <EvaluationResult
                result={evaluationResult}
                onReset={handleReset}
                onEvaluateAnother={handleEvaluateAnother}
              />
            </div>
          ) : (
            <form onSubmit={handleEvaluate}>
              <StudentForm
                studentName={studentName}
                setStudentName={setStudentName}
                studentId={studentId}
                setStudentId={setStudentId}
                disabled={isLoading}
              />

              <PDFUploader
                selectedFile={selectedFile}
                onFileSelect={handleFileSelect}
                onFileRemove={handleFileRemove}
                disabled={isLoading}
                error={fileError}
              />

              <button
                type="submit"
                className="btn btn-primary btn-large"
                disabled={isLoading}
              >
                {isLoading ? 'Evaluating Answer Sheet...' : 'Evaluate Answer Sheet'}
              </button>
            </form>
          )}
        </>
      )}

      {/* Feature 2: Get Answers */}
      {activeTab === 'get-answers' && (
        <GetAnswers />
      )}
    </div>
  );
}
