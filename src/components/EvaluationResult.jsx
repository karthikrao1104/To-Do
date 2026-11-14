import React from 'react';
import QuestionResult from './QuestionResult';

export default function EvaluationResult({
  result,
  onReset,
  onEvaluateAnother
}) {
  const { studentName, studentId, summary, questions } = result;

  return (
    <div className="result-container">
      {/* Student Details & Actions Header */}
      <div className="result-header">
        <div className="student-badge-info">
          <div>
            <span className="student-context">Evaluation result</span>
            <h2 className="student-display-name">{studentName}</h2>
            <p className="student-display-id">ID: {studentId}</p>
          </div>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onEvaluateAnother}
          >
            Evaluate Another Answer Sheet
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={onReset}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Summary Score Cards */}
      <div className="summary-grid">
        <div className="stat-card">
          <span className="stat-label">Total Questions</span>
          <span className="stat-value">{summary.totalQuestions}</span>
        </div>

        <div className="stat-card stat-card-success">
          <span className="stat-label">Correct Answers</span>
          <span className="stat-value text-success">{summary.correctAnswers}</span>
        </div>

        <div className="stat-card stat-card-danger">
          <span className="stat-label">Wrong Answers</span>
          <span className="stat-value text-danger">{summary.wrongAnswers}</span>
        </div>

        <div className="stat-card stat-card-warning">
          <span className="stat-label">Needs Review</span>
          <span className="stat-value text-warning">{summary.needsReview}</span>
        </div>

        <div className="stat-card stat-card-primary">
          <span className="stat-label">Obtained Marks</span>
          <span className="stat-value text-primary">
            {summary.obtainedMarks} / {summary.totalMarks}
          </span>
        </div>

        <div className="stat-card stat-card-accent">
          <span className="stat-label">Percentage</span>
          <span className="stat-value">
            {summary.percentage === 'N/A' ? 'N/A' : `${summary.percentage}%`}
          </span>
        </div>
      </div>

      {/* Detailed Evaluation Table */}
      <div className="table-card">
        <div className="table-header-title">
          <h3>Question-Wise Detailed Evaluation</h3>
          <span className="table-subtitle">
            Answer review with scores calculated from the results
          </span>
        </div>

        <div className="table-wrapper">
          <table className="evaluation-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>#</th>
                <th>Question</th>
                <th style={{ width: '110px', textAlign: 'center' }}>Student Ans</th>
                <th style={{ width: '110px', textAlign: 'center' }}>Correct Ans</th>
                <th style={{ width: '130px', textAlign: 'center' }}>Status</th>
                <th>Evaluation Feedback</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((item) => (
                <QuestionResult
                  key={item.question_number}
                  item={item}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

