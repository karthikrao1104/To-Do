import React from 'react';

export default function QuestionResult({ item }) {
  const getStatusBadge = (status) => {
    switch (status) {
      case 'correct':
        return <span className="status-badge status-correct">✓ Correct (+1)</span>;
      case 'wrong':
        return <span className="status-badge status-wrong">✗ Incorrect (0)</span>;
      case 'needs_review':
      default:
        return <span className="status-badge status-review">⚠ Needs Review</span>;
    }
  };

  const getRowClass = (status) => {
    switch (status) {
      case 'correct':
        return 'row-correct';
      case 'wrong':
        return 'row-wrong';
      case 'needs_review':
      default:
        return 'row-review';
    }
  };

  return (
    <tr className={`question-row ${getRowClass(item.status)}`}>
      <td className="col-qnum">
        <span className="qnum-badge">Q{item.question_number}</span>
      </td>
      <td className="col-question">
        <div className="question-text">{item.question}</div>
      </td>
      <td className="col-ans text-center">
        <span className="ans-tag student-tag">{item.student_answer || '-'}</span>
      </td>
      <td className="col-ans text-center">
        <span className="ans-tag correct-tag">{item.correct_answer || '-'}</span>
      </td>
      <td className="col-status text-center">{getStatusBadge(item.status)}</td>
      <td className="col-feedback">
        <div className="feedback-text">{item.feedback}</div>
      </td>
    </tr>
  );
}

