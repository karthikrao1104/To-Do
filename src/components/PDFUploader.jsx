import React, { useRef } from 'react';

export default function PDFUploader({
  selectedFile,
  onFileSelect,
  onFileRemove,
  disabled,
  error
}) {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (disabled) return;
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  return (
    <div className="uploader-card">
      <h2 className="section-title">Upload Answer Sheet</h2>

      {!selectedFile ? (
        <div
          className={`dropzone ${disabled ? 'disabled' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => !disabled && fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="application/pdf,.pdf"
            style={{ display: 'none' }}
            disabled={disabled}
          />
          <div className="dropzone-icon" aria-hidden="true">PDF</div>
          <p className="dropzone-text">
            <strong>Click to upload</strong> or drag and drop your answer sheet
          </p>
          <p className="dropzone-hint">PDF files only (Max. 10 MB)</p>
        </div>
      ) : (
        <div className="file-preview-card">
          <div className="file-info">
            <span className="file-icon" aria-hidden="true">PDF</span>
            <div className="file-details">
              <span className="file-name" title={selectedFile.name}>
                {selectedFile.name}
              </span>
              <span className="file-size">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </span>
            </div>
          </div>

          <div className="file-actions">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
            >
              Replace
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="application/pdf,.pdf"
              style={{ display: 'none' }}
              disabled={disabled}
            />
            <button
              type="button"
              className="btn btn-danger-text"
              onClick={onFileRemove}
              disabled={disabled}
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {error && <div className="error-badge">{error}</div>}
    </div>
  );
}

