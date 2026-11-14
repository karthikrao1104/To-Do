# AI-Based Student Answer Sheet Evaluation System

A full-stack web application built with **React**, **PDF.js**, **OpenRouter AI**, and **Vercel Serverless Functions**. The system extracts student answer sheet PDF text directly in browser memory, queries OpenRouter AI to independently solve every multiple-choice question (MCQ), and performs independent JavaScript scoring and verification.

---

## 🚀 Features

- **In-Memory PDF Extraction**: Extracts multi-page text using PDF.js without storing files on any server or database.
- **Zero-Storage Privacy**: No database, no user accounts, no permanent storage of exam documents.
- **Independent AI Evaluation**: The AI acts as an impartial examination evaluator. It does not trust the student's answer as an answer key, independently solves each question, identifies the student's choice, and determines the true correct option.
- **Deterministic JavaScript Scoring**: All marks and statistics are calculated in JavaScript:
  - `student_answer === correct_answer` → Correct (1 Mark)
  - `student_answer !== correct_answer` → Incorrect (0 Marks)
  - Ambiguous / unreadable questions → Needs Review (excluded from scorable denominator)
  - Normalized casing and spacing (e.g., `A` vs `a.`)
- **Detailed Evaluation Results**: Summary cards (Total, Correct, Wrong, Needs Review, Score, Percentage) and question-by-question breakdown table with color badges and explanations.

---

## 🛠️ Project Structure

```text
P3_Examevaluate/
├── api/
│   └── evaluate.js                 # Vercel Serverless Function (Secure OpenRouter caller)
├── src/
│   ├── components/
│   │   ├── StudentForm.jsx         # Student Name & ID input form
│   │   ├── PDFUploader.jsx         # Drag-and-drop PDF file uploader (10 MB limit)
│   │   ├── Loading.jsx             # Progress & Spinner state
│   │   ├── EvaluationResult.jsx    # Scorecard summary & question table
│   │   └── QuestionResult.jsx      # Individual question row with status badges
│   ├── services/
│   │   ├── pdfService.js           # Client-side PDF text extraction using PDF.js
│   │   └── evaluationService.js    # Client API call & independent JS scoring logic
│   ├── styles/
│   │   └── App.css                 # Responsive styling & themes
│   ├── App.jsx                     # Main application container & state management
│   └── main.jsx                    # React entry point
├── sample_answersheet.pdf          # Sample 3-question MCQ exam sheet for testing
├── vercel.json                     # Vercel deployment configuration
├── .env.example                    # Template for server-side environment variables
├── .gitignore                      # Excludes .env, node_modules, and build artifacts
└── package.json                    # Dependencies & build scripts
```

---

## 💻 Local Development Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Open `.env` and set your OpenRouter API key and preferred model:
```env
OPENROUTER_API_KEY=sk-or-v1-your-openrouter-key-here
OPENROUTER_MODEL=liquid/lfm-3-1.7b:free
```

### 3. Run the Development Server
```bash
npm run dev
```
The application will run at `http://localhost:5173/`.

---

## 🧪 Testing with the Sample PDF

A sample answer sheet `sample_answersheet.pdf` is provided in the project root containing:
1. **Q1: What is Python?** (Student Answer: **A**, Correct Answer: **A**) → **Correct (+1)**
2. **Q2: Which protocol is used for secure web browsing?** (Student Answer: **B - HTTP**, Correct Answer: **C - HTTPS**) → **Wrong (0)**
3. **Q3: What does CPU stand for?** (Student Answer: **A**, Correct Answer: **A**) → **Correct (+1)**

Expected Scorecard:
- **Total Questions**: 3
- **Correct**: 2
- **Wrong**: 1
- **Score**: 2 / 3
- **Percentage**: 66.7%

---

## 🌐 Vercel Deployment Instructions

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit of Student Answer Sheet Evaluation System"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo-name>.git
git push -u origin main
```

### 2. Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) and log in.
2. Click **"Add New"** → **"Project"**.
3. Import your GitHub repository.
4. Framework Preset: **Vite**.
5. Build Command: `npm run build`.
6. Output Directory: `dist`.

### 3. Configure Environment Variables in Vercel
In your Vercel Project Settings:
1. Navigate to **Settings** → **Environment Variables**.
2. Add:
   - Key: `OPENROUTER_API_KEY`
   - Value: `sk-or-v1-your-actual-key`
3. (Optional) Add:
   - Key: `OPENROUTER_MODEL`
   - Value: `liquid/lfm-3-1.7b:free`
4. Click **Deploy**.
5. After deployment, visit your live URL (e.g. `https://your-project.vercel.app`) to evaluate answer sheets securely in production!
