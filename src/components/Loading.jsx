import React from 'react';

export default function Loading({ message = 'Reviewing answer sheet...' }) {
  return (
    <div className="loading-container">
      <div className="spinner"></div>
      <p className="loading-message"></p>
      <span className="loading-subtext">
        Extracting PDF text, and computing scores...
      </span>
    </div>
  );
}

