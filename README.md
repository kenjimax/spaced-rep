# Flash Card Generator

A web application for creating spaced repetition flashcards using Claude AI, with direct Anki integration via AnkiConnect.

## Features

- **AI-Powered Card Generation**
  - Paste text and highlight sections to create flashcards
  - Claude generates effective cards following spaced repetition best practices
  - Edit cards inline before exporting

- **Anki Integration**
  - Direct export to Anki via AnkiConnect (localhost:8765)
  - Choose target deck and note type before export
  - Field mapping preview (Front/Back auto-detected)
  - Fallback to markdown export if Anki isn't running

- **Modern Interface**
  - Quill.js rich text editor
  - Mobile-responsive layout
  - Resizable split panels
  - Real-time notifications

## Getting Started

### Prerequisites

- Modern web browser
- Claude API key from [Anthropic](https://console.anthropic.com/keys)
- [Anki](https://apps.ankiweb.net/) with [AnkiConnect](https://ankiweb.net/shared/info/2055492159) add-on installed

### Running Locally

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Open `http://localhost:3000`
5. Enter your Claude API key in Settings (gear icon)
6. Make sure Anki is running with AnkiConnect

### Environment Variables

- `PORT`: Server port (defaults to 3000)

API keys are entered in the browser settings and stored in localStorage.

## How to Use

1. Paste text into the editor
2. Highlight a section of text
3. Click "Create Cards"
4. Review and edit the generated cards
5. Click the deck label on any card to change its category
6. Use the menu to "Export to Anki" (or "Export as Markdown" if Anki is offline)

## License

MIT
