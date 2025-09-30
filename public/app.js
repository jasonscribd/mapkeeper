// Mapkeeper - Single Screen Chat Interface
class Mapkeeper {
    constructor() {
        this.quotes = [];
        this.neighbors = {};
        this.path = [];
        this.settings = this.loadSettings();
        this.cache = new Map();
        this.currentSuggestion = null;
        this.recentPicks = new Set();
        
        this.initializeElements();
        this.bindEvents();
        this.loadData();
    }

    initializeElements() {
        // Chat elements
        this.chatMessages = document.getElementById('chat-messages');
        this.chatInput = document.getElementById('chat-input');
        this.sendBtn = document.getElementById('send-btn');
        
        // Path elements
        this.pathContainer = document.getElementById('path-container');
        this.pathCount = document.getElementById('path-count');
        
        // Modal elements
        this.suggestionModal = document.getElementById('suggestion-modal');
        this.settingsModal = document.getElementById('settings-modal');
        this.uploadModal = document.getElementById('upload-modal');
        this.loadingOverlay = document.getElementById('loading-overlay');
        
        // Control buttons
        this.uploadBtn = document.getElementById('upload-btn');
        this.settingsBtn = document.getElementById('settings-btn');
        this.exportBtn = document.getElementById('export-btn');
        
        // Suggestion modal elements
        this.suggestionTitle = document.getElementById('suggestion-title');
        this.suggestionQuote = document.getElementById('suggestion-quote');
        this.suggestionMeta = document.getElementById('suggestion-meta');
        this.suggestionRationale = document.getElementById('suggestion-rationale');
        this.acceptBtn = document.getElementById('accept-btn');
        this.newSuggestionBtn = document.getElementById('new-suggestion-btn');
        
        // Settings elements
        this.modelSelect = document.getElementById('model-select');
        this.temperatureSlider = document.getElementById('temperature-slider');
        this.temperatureValue = document.getElementById('temperature-value');
        this.maxTokensInput = document.getElementById('max-tokens');
        this.openaiApiKeyInput = document.getElementById('openai-api-key');
        this.systemPromptTextarea = document.getElementById('system-prompt');
        
        // Upload elements
        this.uploadArea = document.getElementById('upload-area');
        this.fileInput = document.getElementById('file-input');
        this.browseBtn = document.getElementById('browse-btn');
        this.uploadProgress = document.getElementById('upload-progress');
        this.progressFill = document.getElementById('progress-fill');
        this.progressText = document.getElementById('progress-text');
    }

    bindEvents() {
        // Chat events
        this.sendBtn.addEventListener('click', () => this.handleSendMessage());
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSendMessage();
        });
        
        // Control button events
        this.uploadBtn.addEventListener('click', () => this.showModal('upload'));
        this.settingsBtn.addEventListener('click', () => this.showModal('settings'));
        this.exportBtn.addEventListener('click', () => this.exportPath());
        
        // Modal close events
        document.getElementById('close-suggestion').addEventListener('click', () => this.hideModal('suggestion'));
        document.getElementById('close-settings').addEventListener('click', () => this.hideModal('settings'));
        document.getElementById('close-upload').addEventListener('click', () => this.hideModal('upload'));
        
        // Suggestion modal events
        this.acceptBtn.addEventListener('click', () => this.acceptSuggestion());
        this.newSuggestionBtn.addEventListener('click', () => this.getNewSuggestion());
        
        // Settings events
        this.temperatureSlider.addEventListener('input', (e) => {
            this.temperatureValue.textContent = e.target.value;
        });
        document.getElementById('save-settings').addEventListener('click', () => this.saveSettings());
        document.getElementById('reset-settings').addEventListener('click', () => this.resetSettings());
        
        // Upload events
        this.uploadArea.addEventListener('click', () => this.fileInput.click());
        this.browseBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileUpload(e.target.files[0]));
        
        // Drag and drop
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('dragover');
        });
        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.classList.remove('dragover');
        });
        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && (file.type === 'text/plain' || file.type === 'text/csv' || file.name.endsWith('.csv'))) {
                this.handleFileUpload(file);
            }
        });
        
        // Modal backdrop clicks
        [this.suggestionModal, this.settingsModal, this.uploadModal].forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal(modal.id.replace('-modal', ''));
                }
            });
        });
    }

    async loadData() {
        try {
            // Try to load sample data (optional)
            const quotesResponse = await fetch('data/quotes.jsonl');
            const neighborsResponse = await fetch('data/neighbors.json');
            
            if (quotesResponse.ok) {
                const quotesText = await quotesResponse.text();
                this.quotes = quotesText.trim().split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));
                
                this.enableChat();
                this.addMessage('assistant', `Loaded ${this.quotes.length} sample quotes. Upload your own highlights to get started, or try exploring the samples!`);
            }
            
            if (neighborsResponse.ok) {
                this.neighbors = await neighborsResponse.json();
            }
            
            // Load saved path from localStorage (paths are smaller, so this is OK)
            const savedPath = localStorage.getItem('mapkeeper-path');
            if (savedPath) {
                try {
                    this.path = JSON.parse(savedPath);
                    this.updatePathDisplay();
                } catch (e) {
                    // Clear corrupted path data
                    localStorage.removeItem('mapkeeper-path');
                }
            }
            
        } catch (error) {
            console.log('No sample data found, waiting for upload...');
            this.addMessage('assistant', 'Welcome to Mapkeeper! Upload your Kindle highlights to begin exploring your collection.');
        }
    }

    enableChat() {
        this.chatInput.disabled = false;
        this.sendBtn.disabled = false;
        this.chatInput.placeholder = "Ask about a topic or request a suggestion...";
    }

    async handleSendMessage() {
        const message = this.chatInput.value.trim();
        if (!message) return;
        
        this.addMessage('user', message);
        this.chatInput.value = '';
        
        // Show loading
        this.showLoading();
        
        try {
            // Simple keyword matching for now
            if (message.toLowerCase().includes('suggest') || message.toLowerCase().includes('next')) {
                await this.getSuggestion();
            } else {
                // Search for relevant quotes
                const results = this.searchQuotes(message);
                if (results.length > 0) {
                    this.addMessage('assistant', `Found ${results.length} related quotes. Here's one that might interest you:`);
                    await this.getSuggestion(results[0]);
                } else {
                    this.addMessage('assistant', "I couldn't find quotes directly related to that topic. Let me suggest something from your collection:");
                    await this.getSuggestion();
                }
            }
        } catch (error) {
            this.addMessage('assistant', 'Sorry, I encountered an error. Please try again.');
            console.error('Error handling message:', error);
        } finally {
            this.hideLoading();
        }
    }

    searchQuotes(query) {
        const queryLower = query.toLowerCase();
        const words = queryLower.split(/\s+/);
        
        return this.quotes
            .map(quote => {
                let score = 0;
                const text = quote.text.toLowerCase();
                const title = (quote.book_title || '').toLowerCase();
                const author = (quote.author || '').toLowerCase();
                
                // Exact phrase match
                if (text.includes(queryLower)) score += 10;
                
                // Word matches
                words.forEach(word => {
                    if (text.includes(word)) score += 2;
                    if (title.includes(word)) score += 1;
                    if (author.includes(word)) score += 1;
                });
                
                return { quote, score };
            })
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(item => item.quote);
    }

    async getSuggestion(seedQuote = null) {
        try {
            // Get seed quote (last in path, provided quote, or random)
            const seed = seedQuote || this.getLastPathQuote() || this.getRandomQuote();
            if (!seed) {
                this.addMessage('assistant', 'Please upload your Kindle highlights first.');
                return;
            }
            
            // Get candidates
            const candidates = this.getCandidates(seed);
            if (candidates.length === 0) {
                this.addMessage('assistant', 'No more suggestions available.');
                return;
            }
            
            // Pick best candidate
            const suggestion = this.rankCandidates(candidates, seed)[0];
            
            // Get AI rationale
            const rationale = await this.getAIRationale(seed, suggestion);
            
            this.currentSuggestion = {
                quote: suggestion,
                seed: seed,
                ...rationale
            };
            
            this.showSuggestionModal();
            
        } catch (error) {
            console.error('Error getting suggestion:', error);
            this.addMessage('assistant', 'Sorry, I had trouble generating a suggestion.');
        }
    }

    getCandidates(seed) {
        const candidates = new Set();
        
        // Add semantic neighbors
        const neighbors = this.neighbors[seed.id] || [];
        neighbors.forEach(neighborId => {
            const quote = this.quotes.find(q => q.id === neighborId);
            if (quote && !this.recentPicks.has(quote.id)) {
                candidates.add(quote);
            }
        });
        
        // Add lexical matches (simple implementation)
        const seedWords = seed.text.toLowerCase().split(/\s+/);
        this.quotes.forEach(quote => {
            if (quote.id === seed.id || this.recentPicks.has(quote.id)) return;
            
            const quoteWords = quote.text.toLowerCase().split(/\s+/);
            const commonWords = seedWords.filter(word => 
                word.length > 3 && quoteWords.includes(word)
            );
            
            if (commonWords.length >= 2) {
                candidates.add(quote);
            }
        });
        
        return Array.from(candidates);
    }

    rankCandidates(candidates, seed) {
        return candidates
            .map(candidate => {
                let score = 0;
                
                // Semantic similarity (if we have neighbors data)
                const neighbors = this.neighbors[seed.id] || [];
                const neighborIndex = neighbors.indexOf(candidate.id);
                if (neighborIndex !== -1) {
                    score += (neighbors.length - neighborIndex) / neighbors.length * 0.5;
                }
                
                // Lexical similarity
                const seedWords = new Set(seed.text.toLowerCase().split(/\s+/));
                const candidateWords = candidate.text.toLowerCase().split(/\s+/);
                const commonWords = candidateWords.filter(word => seedWords.has(word));
                score += (commonWords.length / Math.max(seedWords.size, candidateWords.length)) * 0.3;
                
                // Novelty bonus (different author/book)
                if (candidate.author !== seed.author) score += 0.1;
                if (candidate.book_title !== seed.book_title) score += 0.1;
                
                // Random factor
                score += Math.random() * 0.1;
                
                return { quote: candidate, score };
            })
            .sort((a, b) => b.score - a.score)
            .map(item => item.quote);
    }

    async getAIRationale(seed, suggestion) {
        const cacheKey = `${suggestion.id}-${this.hashString(this.settings.systemPrompt)}`;
        
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        // Check if API key is available
        if (!this.settings.openaiApiKey || !this.settings.openaiApiKey.startsWith('sk-')) {
            return {
                title: 'Connected Ideas',
                rationale: 'Add your OpenAI API key in Settings to get AI-powered connection explanations.',
                labels: ['adjacent']
            };
        }
        
        try {
            const messages = [
                {
                    role: 'system',
                    content: this.settings.systemPrompt
                },
                {
                    role: 'user',
                    content: `I'm exploring this quote:
"${seed?.text || 'Starting my journey'}"
${seed?.author ? `— ${seed.author}` : ''}
${seed?.book_title ? `, ${seed.book_title}` : ''}

You're suggesting this next quote:
"${suggestion.text}"
${suggestion.author ? `— ${suggestion.author}` : ''}
${suggestion.book_title ? `, ${suggestion.book_title}` : ''}

Please provide a JSON response with:
- title: A compelling connection title (max 50 characters)
- rationale: Why this quote connects (2-3 sentences)
- labels: Array of connection types ["adjacent"|"oblique"|"wildcard"]

Respond only with valid JSON.`
                }
            ];

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.settings.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.settings.model,
                    messages: messages,
                    temperature: this.settings.temperature,
                    max_tokens: this.settings.maxTokens,
                    response_format: { type: 'json_object' }
                })
            });
            
            if (!response.ok) {
                const errorData = await response.text();
                console.error('OpenAI API error:', errorData);
                throw new Error(`API request failed: ${response.status}`);
            }
            
            const result = await response.json();
            const content = result.choices[0].message.content;
            
            try {
                const parsed = JSON.parse(content);
                const rationale = {
                    title: parsed.title || 'Connected Ideas',
                    rationale: parsed.rationale || 'These quotes share interesting connections.',
                    labels: Array.isArray(parsed.labels) ? parsed.labels : ['adjacent']
                };
                
                this.cache.set(cacheKey, rationale);
                return rationale;
            } catch (parseError) {
                console.error('Error parsing AI response:', parseError);
                throw parseError;
            }
            
        } catch (error) {
            console.error('Error getting AI rationale:', error);
            // Fallback rationale with helpful message
            let fallbackMessage = 'This quote connects to your previous selection through shared themes and concepts.';
            
            if (error.message.includes('401')) {
                fallbackMessage = 'Invalid API key. Please check your OpenAI API key in Settings.';
            } else if (error.message.includes('429')) {
                fallbackMessage = 'Rate limit reached. Please try again in a moment.';
            } else if (error.message.includes('API request failed')) {
                fallbackMessage = 'Unable to connect to OpenAI. Please check your internet connection and API key.';
            }
            
            return {
                title: 'Connected Ideas',
                rationale: fallbackMessage,
                labels: ['adjacent']
            };
        }
    }

    showSuggestionModal() {
        if (!this.currentSuggestion) return;
        
        const { quote, title, rationale, labels } = this.currentSuggestion;
        
        this.suggestionTitle.textContent = title || 'Next Waypoint';
        this.suggestionQuote.textContent = `"${quote.text}"`;
        // Build metadata display with enhanced CSV fields
        let metaHtml = `<strong>${quote.author || 'Unknown Author'}</strong><br>`;
        metaHtml += `<em>${quote.book_title || 'Unknown Book'}</em>`;
        
        // Location info
        if (quote.page) {
            metaHtml += `<br>Page ${quote.page}`;
        } else if (quote.location) {
            const locType = quote.location_type || 'Location';
            metaHtml += `<br>${locType} ${quote.location}`;
        }
        
        // Highlight date (from CSV)
        if (quote.added_at) {
            const date = this.formatHighlightDate(quote.added_at);
            metaHtml += `<br><span class="quote-date">📅 Highlighted ${date}</span>`;
        }
        
        // Tags (from CSV)
        if (quote.tags && quote.tags.length > 0) {
            metaHtml += `<br><span class="quote-tags">🏷️ ${quote.tags.join(', ')}</span>`;
        }
        
        // Highlight color (from CSV)
        if (quote.color) {
            metaHtml += `<br><span class="quote-color">🎨 ${quote.color}</span>`;
        }
        
        // AI connection labels
        if (labels && labels.length > 0) {
            metaHtml += `<br><span class="connection-labels">🔗 ${labels.join(', ')}</span>`;
        }
        
        // Notes (from CSV)
        if (quote.notes) {
            metaHtml += `<br><span class="quote-notes">📝 ${quote.notes}</span>`;
        }
        
        this.suggestionMeta.innerHTML = metaHtml;
        this.suggestionRationale.textContent = rationale || 'An interesting connection to explore.';
        
        this.showModal('suggestion');
    }

    acceptSuggestion() {
        if (!this.currentSuggestion) return;
        
        const quote = this.currentSuggestion.quote;
        this.path.push(quote);
        this.recentPicks.add(quote.id);
        
        // Limit recent picks to prevent repetition
        if (this.recentPicks.size > 20) {
            const oldest = Array.from(this.recentPicks)[0];
            this.recentPicks.delete(oldest);
        }
        
        this.updatePathDisplay();
        this.savePath();
        this.hideModal('suggestion');
        
        this.addMessage('assistant', `Added "${quote.text.substring(0, 50)}..." to your path.`);
        
        // Auto-suggest next
        setTimeout(() => this.getSuggestion(), 1000);
    }

    async getNewSuggestion() {
        this.hideModal('suggestion');
        await this.getSuggestion();
    }


    updatePathDisplay() {
        this.pathCount.textContent = `${this.path.length} waypoint${this.path.length !== 1 ? 's' : ''}`;
        
        if (this.path.length === 0) {
            this.pathContainer.innerHTML = '<div class="empty-path"><p>Your journey will appear here as you accept quotes</p></div>';
            return;
        }
        
        this.pathContainer.innerHTML = this.path.map((quote, index) => {
            let metaText = `${quote.author || 'Unknown'} • ${quote.book_title || 'Unknown Book'}`;
            
            // Add highlight date if available
            if (quote.added_at) {
                const date = this.formatHighlightDate(quote.added_at);
                metaText += ` • 📅 ${date}`;
            }
            
            // Add tags if available (limit to 1-2 for space)
            if (quote.tags && quote.tags.length > 0) {
                metaText += ` • 🏷️ ${quote.tags.slice(0, 1).join(', ')}${quote.tags.length > 1 ? '...' : ''}`;
            }
            
            // Add color if available
            if (quote.color) {
                metaText += ` • 🎨 ${quote.color}`;
            }
            
            return `
                <div class="path-item" data-index="${index}">
                    <div class="path-item-quote">"${quote.text}"</div>
                    <div class="path-item-meta">${metaText}</div>
                </div>
            `;
        }).join('');
    }

    addMessage(sender, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        messageDiv.innerHTML = `
            <div class="message-content">${content}</div>
            <div class="message-time">${timeStr}</div>
        `;
        
        // Remove welcome message if it exists
        const welcomeMsg = this.chatMessages.querySelector('.welcome-message');
        if (welcomeMsg) welcomeMsg.remove();
        
        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    getLastPathQuote() {
        return this.path.length > 0 ? this.path[this.path.length - 1] : null;
    }

    getRandomQuote() {
        if (this.quotes.length === 0) return null;
        const availableQuotes = this.quotes.filter(q => !this.recentPicks.has(q.id));
        const quotes = availableQuotes.length > 0 ? availableQuotes : this.quotes;
        return quotes[Math.floor(Math.random() * quotes.length)];
    }

    async handleFileUpload(file) {
        const isValidFile = file && (
            file.type === 'text/plain' || 
            file.type === 'text/csv' || 
            file.name.endsWith('.txt') || 
            file.name.endsWith('.csv')
        );
        
        if (!isValidFile) {
            alert('Please select a valid Kindle highlights file (.txt or .csv)');
            return;
        }
        
        this.showUploadProgress();
        
        try {
            // Check file size (warn if very large)
            const fileSizeMB = file.size / (1024 * 1024);
            if (fileSizeMB > 10) {
                const proceed = confirm(`This file is ${fileSizeMB.toFixed(1)}MB. Large files may take a moment to process. Continue?`);
                if (!proceed) {
                    this.hideUploadProgress();
                    return;
                }
            }
            
            const text = await this.readFileAsText(file);
            const isCSV = file.name.endsWith('.csv') || file.type === 'text/csv';
            
            // Update progress text
            this.progressText.textContent = isCSV ? 'Parsing CSV data...' : 'Parsing Kindle highlights...';
            
            const quotes = isCSV ? this.parseCSVHighlights(text) : this.parseKindleHighlights(text);
            
            if (quotes.length === 0) {
                throw new Error('No highlights found in the file. Please check the format.');
            }
            
            // Update progress
            this.progressText.textContent = `Processing ${quotes.length} quotes...`;
            
            this.quotes = quotes;
            this.path = [];
            this.recentPicks.clear();
            
            // Note: Quotes are kept in memory only (not localStorage due to size limits)
            // This means they'll be lost on page refresh, but avoids storage quota errors
            
            this.hideModal('upload');
            this.enableChat();
            
            const formatInfo = isCSV ? ' (CSV format with enhanced metadata)' : ' (TXT format)';
            this.addMessage('assistant', `Successfully imported ${quotes.length} highlights${formatInfo}! Your data is loaded for this session. Ready to explore your collection.`);
            
        } catch (error) {
            console.error('Error processing file:', error);
            let errorMessage = error.message;
            
            // Provide helpful error messages
            if (error.message.includes('quota')) {
                errorMessage = 'File too large for browser storage. Please try a smaller file or use the Python script for processing.';
            } else if (error.message.includes('JSON')) {
                errorMessage = 'Invalid file format. Please ensure you\'re uploading a valid Kindle highlights file.';
            }
            
            alert('Error processing file: ' + errorMessage);
        } finally {
            this.hideUploadProgress();
        }
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    parseKindleHighlights(text) {
        const quotes = [];
        const sections = text.split(/==========\s*\n/);
        
        sections.forEach((section, index) => {
            const lines = section.trim().split('\n');
            if (lines.length < 3) return;
            
            // Parse title and author from first line
            const titleLine = lines[0];
            const match = titleLine.match(/^(.+?)\s*\(([^)]+)\)$/);
            const book_title = match ? match[1].trim() : titleLine;
            const author = match ? match[2].trim() : '';
            
            // Parse location/page info from second line
            const locationLine = lines[1];
            const locationMatch = locationLine.match(/Location (\d+)/);
            const pageMatch = locationLine.match(/page (\d+)/);
            const dateMatch = locationLine.match(/Added on (.+)$/);
            
            // Get the highlight text (remaining lines)
            const text = lines.slice(2).join('\n').trim();
            if (!text) return;
            
            quotes.push({
                id: `quote_${index}`,
                text: text,
                author: author,
                book_title: book_title,
                page: pageMatch ? parseInt(pageMatch[1]) : null,
                location: locationMatch ? parseInt(locationMatch[1]) : null,
                added_at: dateMatch ? dateMatch[1] : null,
                tags: [],
                notes: null,
                source: 'Kindle'
            });
        });
        
        return quotes;
    }

    parseCSVHighlights(csvText) {
        const quotes = [];
        const lines = csvText.trim().split('\n');
        
        if (lines.length < 2) return quotes; // Need at least header + 1 data row
        
        // Parse header
        const header = this.parseCSVLine(lines[0]);
        const columnMap = this.createColumnMap(header);
        
        // Parse data rows
        lines.slice(1).forEach((line, index) => {
            if (!line.trim()) return;
            
            try {
                const values = this.parseCSVLine(line);
                const quote = this.parseCSVRow(values, columnMap, index);
                if (quote) {
                    quotes.push(quote);
                }
            } catch (error) {
                console.warn(`Error parsing CSV row ${index + 2}:`, error);
            }
        });
        
        return quotes;
    }

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        let i = 0;
        
        while (i < line.length) {
            const char = line[i];
            
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    // Escaped quote
                    current += '"';
                    i += 2;
                } else {
                    // Toggle quote state
                    inQuotes = !inQuotes;
                    i++;
                }
            } else if (char === ',' && !inQuotes) {
                // Field separator
                result.push(current.trim());
                current = '';
                i++;
            } else {
                current += char;
                i++;
            }
        }
        
        // Add the last field
        result.push(current.trim());
        return result;
    }

    createColumnMap(header) {
        const map = {};
        const columnMappings = {
            'highlight': ['highlight', 'text', 'quote', 'content'],
            'book_title': ['book title', 'title', 'book', 'book_title'],
            'author': ['book author', 'author', 'book_author'],
            'location': ['location'],
            'note': ['note', 'notes'],
            'color': ['color', 'colour'],
            'tags': ['tags', 'tag'],
            'location_type': ['location type', 'location_type'],
            'highlighted_at': ['highlighted at', 'highlighted_at', 'date', 'timestamp'],
            'amazon_id': ['amazon book id', 'amazon_book_id', 'book_id', 'id']
        };
        
        header.forEach((col, index) => {
            const colLower = col.toLowerCase().trim();
            for (const [field, variations] of Object.entries(columnMappings)) {
                if (variations.includes(colLower)) {
                    map[field] = index;
                    break;
                }
            }
        });
        
        return map;
    }

    parseCSVRow(values, columnMap, rowIndex) {
        const getValue = (field) => {
            const index = columnMap[field];
            return index !== undefined ? values[index]?.trim() || '' : '';
        };
        
        const text = getValue('highlight');
        if (!text || text.toLowerCase() === 'n/a') return null;
        
        const author = getValue('author');
        const book_title = getValue('book_title');
        const location = getValue('location');
        const note = getValue('note');
        const color = getValue('color');
        const tags = getValue('tags');
        const location_type = getValue('location_type');
        const highlighted_at = getValue('highlighted_at');
        const amazon_id = getValue('amazon_id');
        
        // Parse location as number
        let parsedLocation = null;
        if (location) {
            const locationNum = parseInt(location);
            if (!isNaN(locationNum)) {
                parsedLocation = locationNum;
            }
        }
        
        // Parse tags
        const parsedTags = tags ? tags.split(/[,;|]/).map(t => t.trim()).filter(t => t) : [];
        
        return {
            id: `quote_${String(rowIndex + 1).padStart(6, '0')}`,
            text: text,
            author: author,
            book_title: book_title,
            page: null,
            location: parsedLocation,
            added_at: highlighted_at || null,
            tags: parsedTags,
            notes: note || null,
            source: 'Kindle',
            color: color || null,
            location_type: location_type || null,
            amazon_id: amazon_id || null
        };
    }

    showUploadProgress() {
        this.uploadProgress.classList.remove('hidden');
        this.uploadArea.style.display = 'none';
        
        // Simulate progress
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.random() * 20;
            if (progress >= 100) {
                progress = 100;
                clearInterval(interval);
            }
            this.progressFill.style.width = `${progress}%`;
        }, 200);
    }

    hideUploadProgress() {
        this.uploadProgress.classList.add('hidden');
        this.uploadArea.style.display = 'block';
        this.progressFill.style.width = '0%';
    }

    exportPath() {
        if (this.path.length === 0) {
            alert('No path to export yet. Accept some suggestions first!');
            return;
        }
        
        const markdown = this.path.map((quote, index) => {
            let waypointMd = `## Waypoint ${index + 1}\n\n> ${quote.text}\n\n`;
            
            // Attribution
            waypointMd += `*— ${quote.author || 'Unknown Author'}, ${quote.book_title || 'Unknown Book'}*\n\n`;
            
            // Additional metadata from CSV
            const metadata = [];
            if (quote.added_at) {
                const date = this.formatHighlightDate(quote.added_at);
                metadata.push(`**Highlighted:** ${date}`);
            }
            if (quote.tags && quote.tags.length > 0) {
                metadata.push(`**Tags:** ${quote.tags.join(', ')}`);
            }
            if (quote.color) {
                metadata.push(`**Highlight Color:** ${quote.color}`);
            }
            if (quote.notes) {
                metadata.push(`**Notes:** ${quote.notes}`);
            }
            if (quote.location) {
                const locType = quote.location_type || 'Location';
                metadata.push(`**${locType}:** ${quote.location}`);
            }
            
            if (metadata.length > 0) {
                waypointMd += metadata.join(' • ') + '\n\n';
            }
            
            waypointMd += '---\n';
            return waypointMd;
        }).join('\n');
        
        const blob = new Blob([`# My Mapkeeper Journey\n\n${markdown}`], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mapkeeper-path-${new Date().toISOString().split('T')[0]}.md`;
        a.click();
        URL.revokeObjectURL(url);
    }

    showModal(type) {
        const modal = document.getElementById(`${type}-modal`);
        if (modal) {
            modal.classList.remove('hidden');
            
            // Load settings if opening settings modal
            if (type === 'settings') {
                this.loadSettingsToForm();
            }
        }
    }

    hideModal(type) {
        const modal = document.getElementById(`${type}-modal`);
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    showLoading() {
        this.loadingOverlay.classList.remove('hidden');
    }

    hideLoading() {
        this.loadingOverlay.classList.add('hidden');
    }

    loadSettings() {
        const defaultSettings = {
            model: 'gpt-4o-mini',
            temperature: 0.7,
            maxTokens: 150,
            openaiApiKey: '',
            systemPrompt: `You are Mapkeeper, a thoughtful guide through a personal library of quotes and highlights. Your role is to suggest meaningful connections between ideas, helping users discover unexpected pathways through their own collected wisdom.

When suggesting a quote, provide:
1. A brief, compelling title for why this quote connects
2. A concise rationale (2-3 sentences) explaining the connection
3. Labels indicating the type of connection: "adjacent" (closely related), "oblique" (unexpected angle), or "wildcard" (surprising leap)

Be curious, insightful, and respectful of the personal nature of these collected thoughts.`
        };
        
        const saved = localStorage.getItem('mapkeeper-settings');
        return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
    }

    loadSettingsToForm() {
        this.modelSelect.value = this.settings.model;
        this.temperatureSlider.value = this.settings.temperature;
        this.temperatureValue.textContent = this.settings.temperature;
        this.maxTokensInput.value = this.settings.maxTokens;
        this.openaiApiKeyInput.value = this.settings.openaiApiKey;
        this.systemPromptTextarea.value = this.settings.systemPrompt;
    }

    saveSettings() {
        this.settings = {
            model: this.modelSelect.value,
            temperature: parseFloat(this.temperatureSlider.value),
            maxTokens: parseInt(this.maxTokensInput.value),
            openaiApiKey: this.openaiApiKeyInput.value,
            systemPrompt: this.systemPromptTextarea.value
        };
        
        localStorage.setItem('mapkeeper-settings', JSON.stringify(this.settings));
        this.hideModal('settings');
        this.addMessage('assistant', 'Settings saved successfully!');
    }

    resetSettings() {
        this.settings = this.loadSettings();
        this.loadSettingsToForm();
        localStorage.removeItem('mapkeeper-settings');
        this.addMessage('assistant', 'Settings reset to defaults.');
    }

    savePath() {
        localStorage.setItem('mapkeeper-path', JSON.stringify(this.path));
    }

    formatHighlightDate(dateString) {
        if (!dateString) return '';
        
        try {
            // Handle various date formats
            let date;
            
            // Try parsing as ISO string first
            if (dateString.includes('T') || dateString.includes('-')) {
                date = new Date(dateString);
            } else {
                // Try parsing other formats
                date = new Date(dateString);
            }
            
            // Check if date is valid
            if (isNaN(date.getTime())) {
                return dateString; // Return original string if can't parse
            }
            
            // Format as readable date
            const now = new Date();
            const diffTime = Math.abs(now - date);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            // Show relative time for recent dates
            if (diffDays === 0) {
                return 'today';
            } else if (diffDays === 1) {
                return 'yesterday';
            } else if (diffDays < 7) {
                return `${diffDays} days ago`;
            } else if (diffDays < 30) {
                const weeks = Math.floor(diffDays / 7);
                return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
            } else if (diffDays < 365) {
                const months = Math.floor(diffDays / 30);
                return `${months} month${months > 1 ? 's' : ''} ago`;
            } else {
                // For older dates, show the actual date
                return date.toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric' 
                });
            }
        } catch (error) {
            console.warn('Error formatting date:', dateString, error);
            return dateString; // Return original string if error
        }
    }

    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString();
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.mapkeeper = new Mapkeeper();
});


