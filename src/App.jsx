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
  const [fileError, setFileError] = useState('');
  const [evaluationResult, setEvaluationResult] = useState(null);

  const handleFileSelect = (file) => {
    setFileError('');
    setError('');

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
    setFileError('');
    setEvaluationResult(null);
  };

  const handleEvaluateAnother = () => {
    setSelectedFile(null);
    setError('');
    setFileError('');
    setEvaluationResult(null);
  };

  const handleEvaluate = async (e) => {
    e.preventDefault();
    setError('');
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

      setLoadingMessage('Reviewing answers and calculating the score...');

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
            <div className="error-banner" role="alert">
              <span>{error}</span>
            </div>
          )}

          {/* Main Content Area */}
          {isLoading ? (
            <Loading message={loadingMessage} />
          ) : evaluationResult ? (
            <EvaluationResult
              result={evaluationResult}
              onReset={handleReset}
              onEvaluateAnother={handleEvaluateAnother}
            />
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
                Evaluate Answer Sheet
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
