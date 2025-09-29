# Mapkeeper

A single-screen chat interface that walks you through your Kindle highlights by proposing one "waypoint" at a time from your own corpus. Mapkeeper creates a searchable graph of your quotes and uses AI to suggest meaningful connections and pathways through your collected wisdom.

## Features

- **Single-screen interface**: Clean chat on the left, your path on the right
- **AI-guided exploration**: Get thoughtful suggestions for your next quote
- **Semantic search**: Find connections based on meaning, not just keywords
- **Offline-first**: Your data stays local, only rationales go to AI
- **Export paths**: Save your journeys as beautiful markdown files
- **Customizable**: Edit system prompts and AI settings

## Quick Start

### 1. Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/mapkeeper.git
cd mapkeeper

# Install Python dependencies
pip install -r requirements.txt
```

### 2. Import Your Kindle Highlights

```bash
# Parse your Kindle highlights file
python scripts/parse_kindle.py "My Clippings.txt" data/quotes.jsonl

# Build the semantic graph (optional but recommended)
python scripts/build_graph.py data/quotes.jsonl data/neighbors.json
```

### 3. Run Locally

```bash
# Start local development server
npm run dev
# or
python -m http.server 8080 --directory public
```

Open http://localhost:8080 in your browser.

### 4. Deploy (Optional)

For AI suggestions, deploy the serverless function to:
- **Netlify**: Copy `functions/mapkeeper.js` to your Netlify functions folder
- **Vercel**: Deploy as an Edge Function
- **Cloudflare Workers**: Deploy the handler

Set your `OPENAI_API_KEY` environment variable.

## How It Works

### Offline Build Process

1. **Parse Kindle highlights** → `quotes.jsonl` with metadata
2. **Generate embeddings** → Find semantic neighbors for each quote
3. **Build graph** → `neighbors.json` with similarity connections

### Runtime Experience

1. **Seed selection**: Last accepted quote or user query
2. **Candidate ranking**: Semantic + lexical + novelty scoring
3. **AI rationale**: Send only quote text to get connection explanation
4. **Path building**: Accept quotes to build your journey

### Architecture

```
public/           # Static frontend files
├── index.html    # Single-screen interface
├── styles.css    # Modern UI styling
└── app.js        # Core application logic

data/             # Your quote corpus (local)
├── quotes.jsonl  # Parsed Kindle highlights
└── neighbors.json # Semantic similarity graph

scripts/          # Offline processing tools
├── parse_kindle.py  # TXT → JSONL converter
└── build_graph.py   # Embedding → neighbors

functions/        # Serverless AI proxy
└── mapkeeper.js  # OpenAI integration
```

## Usage

### Importing Highlights

Mapkeeper supports two input formats:

**Option 1: Standard Kindle TXT Export**
Export your Kindle highlights as "My Clippings.txt" and run:

```bash
python scripts/parse_kindle.py "My Clippings.txt" data/quotes.jsonl
```

**Option 2: CSV Export (Enhanced)**
If you have a CSV export with columns like yours:
- Highlight, Book Title, Book Author, Amazon Book ID, Note, Color, Tags, Location Type, Location, Highlighted at

```bash
python scripts/parse_kindle.py "highlights.csv" data/quotes.jsonl
```

The CSV format preserves additional metadata:
- **Highlight colors** (Yellow, Blue, Pink, Orange, etc.)
- **Tags** (comma/semicolon separated)
- **Notes** (your personal annotations)
- **Amazon Book IDs** (for cross-referencing)
- **Location types** (Page vs Location)

Both formats create structured JSON with:
- Quote text and metadata
- Author and book information
- Timestamps and locations
- Enhanced CSV fields (colors, tags, notes)

### Building the Graph

Generate semantic connections:

```bash
python scripts/build_graph.py data/quotes.jsonl data/neighbors.json --k 10
```

Options:
- `--k`: Number of neighbors per quote (default: 10)
- `--model`: Sentence transformer model (default: all-MiniLM-L6-v2)
- `--no-lexical`: Skip building lexical index

### Using the Interface

1. **Upload**: Drop your Kindle TXT or CSV file (or use sample data)
2. **Explore**: Ask for suggestions or search topics
3. **Accept**: Build your path by accepting interesting quotes
4. **Export**: Save your journey as markdown with full metadata

**Enhanced CSV Features in the Interface:**
- 🏷️ **Tags** displayed with quotes for easy categorization
- 🎨 **Colors** show your original highlight colors
- 📝 **Notes** display your personal annotations
- 🔗 **Connection labels** from AI (adjacent/oblique/wildcard)
- Rich metadata in exported markdown files

### Settings

Customize the AI behavior:
- **Model**: Choose GPT model (4o-mini, 4o, 3.5-turbo)
- **Temperature**: Control creativity (0.0-1.0)
- **Max Tokens**: Limit response length
- **System Prompt**: Edit the AI's personality and instructions

## Deployment

### Static Hosting

Deploy the `public/` folder to:
- GitHub Pages
- Netlify
- Vercel
- Any static host

### Serverless Functions

For AI features, deploy `functions/mapkeeper.js`:

**Netlify Functions:**
```bash
# netlify.toml
[build]
  functions = "functions"

[functions]
  node_bundler = "esbuild"
```

**Vercel:**
```bash
# vercel.json
{
  "functions": {
    "functions/mapkeeper.js": {
      "runtime": "nodejs18.x"
    }
  }
}
```

**Environment Variables:**
- `OPENAI_API_KEY`: Your OpenAI API key
- `ALLOWED_ORIGINS`: Comma-separated allowed origins (optional)

## Development

### Project Structure

- **Frontend**: Vanilla JS, no frameworks
- **Backend**: Serverless functions for AI integration
- **Data**: Local JSON files, no database required
- **AI**: OpenAI API for rationales and narrations

### Key Files

- `public/app.js`: Main application logic
- `functions/mapkeeper.js`: AI proxy with caching and rate limiting
- `scripts/parse_kindle.py`: Kindle TXT parser
- `scripts/build_graph.py`: Semantic graph builder

### Adding Features

The codebase is designed for easy extension:
- Add new quote sources in `parse_kindle.py`
- Modify ranking algorithms in `app.js`
- Customize AI prompts in `functions/mapkeeper.js`
- Extend the UI in `index.html` and `styles.css`

## Privacy & Data

- **Local-first**: Your quotes stay on your device
- **Minimal AI calls**: Only quote text sent for rationales
- **No tracking**: No analytics or user tracking
- **Open source**: Full transparency in data handling

## Requirements

- **Python 3.8+** for offline processing
- **Modern browser** for the interface
- **OpenAI API key** for AI features (optional)

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

- **Issues**: GitHub Issues for bugs and features
- **Discussions**: GitHub Discussions for questions
- **Documentation**: See `/docs` for detailed guides

---

*Mapkeeper: Navigate your collected wisdom, one thoughtful connection at a time.*


