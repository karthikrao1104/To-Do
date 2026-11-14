import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  // Use unpkg CDN matching the installed version to ensure web worker stability across environments
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.0.379'}/build/pdf.worker.min.mjs`;
}

/**
 * Extracts plain text from an uploaded PDF File in-memory.
 * Reads page by page, preserving structure as much as possible.
 *
 * @param {File} file - PDF file uploaded by the user
 * @returns {Promise<string>} Combined extracted text from all pages
 */
export async function extractTextFromPDF(file) {
  if (!file) {
    throw new Error('No PDF file provided.');
  }

  if (file.type && file.type !== 'application/pdf') {
    throw new Error('Invalid file type. Please upload a standard PDF file.');
  }

  // 10 MB limit check
  const MAX_SIZE_BYTES = 10 * 1024 * 1024;
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error('File size exceeds 10 MB limit.');
  }

  // Read file into an ArrayBuffer in memory (no disk or server storage)
  const arrayBuffer = await file.arrayBuffer();

  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;

  if (numPages === 0) {
    throw new Error('The uploaded PDF has no pages.');
  }

  const pageTexts = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Group items by vertical position (transform[5]) or line structure
    let lastY = null;
    let pageString = '';

    for (const item of textContent.items) {
      if (!('str' in item)) continue;

      const currentY = item.transform ? Math.round(item.transform[5]) : null;

      if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 5) {
        pageString += '\n';
      } else if (pageString.length > 0 && !pageString.endsWith(' ') && !pageString.endsWith('\n')) {
        pageString += ' ';
      }

      pageString += item.str;
      lastY = currentY;
    }

    const trimmedPage = pageString.trim();
    if (trimmedPage) {
      pageTexts.push(`--- Page ${pageNum} ---\n${trimmedPage}`);
    }
  }

  const combinedText = pageTexts.join('\n\n').trim();

  if (!combinedText) {
    throw new Error('The PDF appears to be empty, image-only (scanned), or text could not be extracted.');
  }

  return combinedText;
}

