import React, { useState, useRef } from 'react';
import Loading from './Loading';
import { extractTextFromPDF } from '../services/pdfService';
import { getAnswersFromQuestionPaper } from '../services/answerGenerator';
import './GetAnswers.css';

export default function GetAnswers() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [error, setError] = useState('');
  const [retryAfter, setRetryAfter] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [resultsData, setResultsData] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [copyToast, setCopyToast] = useState('');

  const fileInputRef = useRef(null);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const validateAndSetFile = (file) => {
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

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFileError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setFileError('');
    setError('');
    setRetryAfter(null);
    setResultsData(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGenerateAgain = () => {
    setResultsData(null);
    setError('');
    setRetryAfter(null);
    setFileError('');
  };

  const handleGenerateAnswers = async (e) => {
    if (e && e.preventDefault) {
      e.preventDefault();
    }

    if (isLoading) return; // Prevent duplicate submission

    setError('');
    setRetryAfter(null);
    setFileError('');

    if (!selectedFile) {
      setFileError('Please select or upload a question paper PDF.');
      return;
    }

    try {
      setIsLoading(true);
      setLoadingMessage('Extracting question paper text from PDF...');

      const extractedText = await extractTextFromPDF(selectedFile);

      setLoadingMessage('AI is solving questions with multi-provider fallback (OpenRouter, Gemini, Groq)...');

      const response = await getAnswersFromQuestionPaper({ extractedText });
      setResultsData(response);
    } catch (err) {
      console.error('Get Answers Error:', err);
      setError(err.message || 'An unexpected error occurred while generating answers.');
      if (err.retryAfter) {
        setRetryAfter(err.retryAfter);
      }
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  const triggerToast = (msg) => {
    setCopyToast(msg);
    setTimeout(() => {
      setCopyToast('');
    }, 3000);
  };

  const handleCopyAll = () => {
    if (!resultsData?.results) return;

    const textToCopy = resultsData.results
      .map((item) => {
        const optionsText = Object.entries(item.options || {})
          .map(([k, v]) => `  ${k}. ${v}`)
          .join('\n');

        return `QUESTION ${item.question_number} [${item.status === 'needs_review' ? 'NEEDS REVIEW' : 'SOLVED'}]
${item.question}

Options:
${optionsText || '  (No options detected)'}

Correct Option: ${item.correct_option}
Correct Answer: ${item.correct_answer}

Explanation:
${item.explanation || 'None provided.'}
--------------------------------------------------`;
      })
      .join('\n\n');

    navigator.clipboard.writeText(textToCopy).then(() => {
      triggerToast('All answers copied to clipboard!');
    }).catch(() => {
      triggerToast('Failed to copy to clipboard.');
    });
  };

  const handleDownload = () => {
    if (!resultsData?.results) return;

    let content = `AI QUESTION PAPER SOLVER - ANSWER KEY\n`;
    content += `Generated on: ${new Date().toLocaleString()}\n`;
    if (resultsData.providerUsed) {
      content += `Provider: ${resultsData.providerUsed} (${resultsData.modelUsed || 'Default'})\n`;
    }
    content += `Total Questions: ${resultsData.summary.totalQuestions} | Solved: ${resultsData.summary.solvedQuestions} | Needs Review: ${resultsData.summary.reviewQuestions}\n`;
    content += `==================================================\n\n`;

    resultsData.results.forEach((item) => {
      const optionsText = Object.entries(item.options || {})
        .map(([k, v]) => `  ${k}. ${v}`)
        .join('\n');

      content += `QUESTION ${item.question_number} (${item.status === 'needs_review' ? 'NEEDS REVIEW' : 'SOLVED'})\n`;
      content += `${item.question}\n\n`;
      content += `Options:\n${optionsText || '  (None)'}\n\n`;
      content += `Correct Option: ${item.correct_option}\n`;
      content += `Correct Answer: ${item.correct_answer}\n`;
      content += `Explanation: ${item.explanation || 'None'}\n`;
      content += `\n--------------------------------------------------\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Answer_Key_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="qa-container">
      {/* Global Error Notice */}
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
                onClick={handleGenerateAnswers}
                disabled={isLoading}
              >
                Retry Now
              </button>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <Loading message={loadingMessage} />
      ) : resultsData ? (
        /* Results Section */
        <div>
          {/* Active Provider Indicator */}
          {resultsData.providerUsed && (
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
              <span>Solved via: <strong>{resultsData.providerUsed}</strong></span>
              {resultsData.modelUsed && <span>({resultsData.modelUsed})</span>}
            </div>
          )}

          {/* Summary Stats Cards */}
          <div className="qa-results-summary">
            <div className="qa-stat-card qa-stat-total">
              <div className="qa-stat-value">{resultsData.summary.totalQuestions}</div>
              <div className="qa-stat-label">Total Questions</div>
            </div>
            <div className="qa-stat-card qa-stat-solved">
              <div className="qa-stat-value">{resultsData.summary.solvedQuestions}</div>
              <div className="qa-stat-label">Questions Solved</div>
            </div>
            <div className="qa-stat-card qa-stat-review">
              <div className="qa-stat-value">{resultsData.summary.reviewQuestions}</div>
              <div className="qa-stat-label">Needs Review</div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="qa-toolbar">
            <button
              type="button"
              className="qa-btn qa-btn-secondary"
              onClick={handleCopyAll}
            >
              Copy All Answers
            </button>
            <button
              type="button"
              className="qa-btn qa-btn-secondary"
              onClick={handleDownload}
            >
              Download Answer Key
            </button>
            <button
              type="button"
              className="qa-btn qa-btn-secondary"
              onClick={handleGenerateAgain}
            >
              Generate Again
            </button>
            <button
              type="button"
              className="qa-btn qa-btn-primary"
              onClick={handleReset}
            >
              Reset All
            </button>
          </div>

          {/* Questions & Answers List */}
          <div className="qa-questions-list">
            {resultsData.results.map((item, index) => {
              const isReview = item.status === 'needs_review';
              return (
                <div
                  key={index}
                  className={`qa-question-card ${
                    isReview ? 'qa-status-review' : 'qa-status-solved'
                  }`}
                >
                  <div className="qa-question-header">
                    <span className="qa-question-badge">
                      QUESTION {item.question_number || index + 1}
                    </span>
                    <span
                      className={`qa-status-pill ${
                        isReview ? 'qa-pill-review' : 'qa-pill-solved'
                      }`}
                    >
                      {isReview ? 'Needs Review' : 'Solved'}
                    </span>
                  </div>

                  <div className="qa-question-text">{item.question}</div>

                  {/* Options */}
                  {item.options && Object.keys(item.options).length > 0 && (
                    <div className="qa-options-grid">
                      {Object.entries(item.options).map(([letter, text]) => {
                        const isCorrectOption =
                          letter.toUpperCase() === item.correct_option?.toUpperCase();
                        return (
                          <div
                            key={letter}
                            className={`qa-option-item ${
                              isCorrectOption ? 'qa-option-correct' : ''
                            }`}
                          >
                            <span className="qa-option-letter">{letter}</span>
                            <span className="qa-option-content">{text}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Solved Answer & Explanation */}
                  <div className="qa-answer-box">
                    <div className="qa-answer-row">
                      <span className="qa-answer-label">Correct Option:</span>
                      <span className="qa-answer-badge">{item.correct_option}</span>
                    </div>

                    <div className="qa-answer-row">
                      <span className="qa-answer-label">Correct Answer:</span>
                      <span className="qa-answer-value">{item.correct_answer}</span>
                    </div>

                    {item.explanation && (
                      <div className="qa-explanation-box">
                        <span className="qa-answer-label">Explanation:</span>
                        <p className="qa-explanation-text">{item.explanation}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Upload Form */
        <div className="qa-card">
          <div className="qa-card-header">
            <h2 className="qa-card-title">AI Question Paper Solver</h2>
            <p className="qa-card-subtitle">
              Upload a multiple-choice question paper PDF and generate accurate answers with step-by-step explanations.
            </p>
          </div>

          <form onSubmit={handleGenerateAnswers}>
            <div
              className={`qa-upload-area ${isDragging ? 'qa-dragging' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="qa-file-input"
                onChange={handleFileChange}
              />
              <div className="qa-upload-icon" aria-hidden="true">PDF</div>
              <p className="qa-upload-title">
                {selectedFile ? 'Replace Question Paper PDF' : 'Select or Drop Question Paper PDF'}
              </p>
              <p className="qa-upload-hint">Supported formats: standard text PDF (Max 10 MB)</p>
            </div>

            {fileError && <p className="qa-field-error">{fileError}</p>}

            {/* Selected File Card */}
            {selectedFile && (
              <div className="qa-selected-file">
                <div className="qa-file-details">
                  <span className="qa-filename">{selectedFile.name}</span>
                  <span className="qa-filesize">{formatFileSize(selectedFile.size)}</span>
                </div>
                <div className="qa-file-actions">
                  <button
                    type="button"
                    className="qa-btn-text"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    className="qa-btn-text qa-btn-remove"
                    onClick={handleRemoveFile}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-large qa-submit-btn"
              disabled={isLoading || !selectedFile}
            >
              {isLoading ? 'Solving Question Paper...' : 'Generate Answers'}
            </button>
          </form>
        </div>
      )}

      {/* Copy Toast Notification */}
      {copyToast && <div className="qa-copy-toast">{copyToast}</div>}
    </div>
  );
}
