import React from 'react';

export default function StudentForm({
  studentName,
  setStudentName,
  studentId,
  setStudentId,
  disabled
}) {
  return (
    <div className="form-card">
      <h2 className="section-title">Student Information</h2>
      <div className="form-grid">
        <div className="input-group">
          <label htmlFor="studentName">
            Student Full Name <span className="required">*</span>
          </label>
          <input
            id="studentName"
            type="text"
            placeholder="e.g. Jane Doe"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            disabled={disabled}
            autoComplete="name"
          />
        </div>

        <div className="input-group">
          <label htmlFor="studentId">
            Student ID / Roll No. <span className="required">*</span>
          </label>
          <input
            id="studentId"
            type="text"
            placeholder="e.g. STU-2024-889"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            disabled={disabled}
            autoComplete="off"
          />
        </div>
      </div>
    </div>
  );
}

