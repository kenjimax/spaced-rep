# Flash Card Generator - Project Documentation

## Project Overview

Flash Card Generator is a web application for creating spaced repetition flashcards from text content. Users paste text, highlight sections, and use Claude to generate effective flashcards that can be exported directly to Anki (via AnkiConnect) or as markdown files.

### Core Purpose

Simplify the creation of effective spaced repetition cards following best practices from researchers like Michael Nielsen and Andy Matuschak. Focus on conceptual understanding over rote memorization.

## Technical Architecture

### Frontend
- Pure HTML/CSS/JavaScript (ES modules)
- Quill.js rich text editor with highlighting
- Card preview with inline editing
- Mobile-responsive design
- AnkiConnect client-side integration (localhost:8765)

### Backend
- Node.js Express server (proxies Claude API calls)
- Claude API integration for card generation and text analysis
- Client-side API key management (stored in localStorage)

## Key Functionality

1. **Text Input & Selection**: Paste text, highlight sections to convert to flashcards
2. **Card Generation**: Claude generates 1-5 cards per selection with deck categorization
3. **Anki Integration**: Export via AnkiConnect with deck + note type selection, field mapping preview
4. **Markdown Fallback**: If Anki isn't running, exports as downloadable markdown

## Environment Setup

- `npm start` or `npm run dev` (with nodemon)
- Claude API key entered in browser settings (no server env vars needed)
- Anki must be running with AnkiConnect add-on installed
- Server runs on port 3000 by default

## Common Commands

```bash
npm start     # Start server
npm run dev   # Development mode with auto-restart
```
