import React, { useState } from 'react';
import StudentForm from './components/StudentForm';
import PDFUploader from './components/PDFUploader';
import Loading from './components/Loading';
import EvaluationResult from './components/EvaluationResult';
import { extractTextFromPDF } from './services/pdfService';
import { evaluateAnswerSheet } from './services/evaluationService';
import './styles/App.css';

export default function App() {
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

      setLoadingMessage('AI is independently solving MCQs and verifying answers...');

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
        
        <h1 className="app-title">AI Student Answer Sheet Evaluator</h1>
        <p className="app-subtitle">
          Upload any student MCQ answer-sheet PDF. Our AI independently solves every question,
          validates actual answers, and produces an instant, calculated scorecard.
        </p>
      </header>

      {/* Global Error Banner */}
      {error && (
        <div className="error-banner" role="alert">
          <span style={{ fontSize: '1.25rem' }}>⚠️</span>
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
    </div>
  );
}
