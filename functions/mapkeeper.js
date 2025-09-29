/**
 * Mapkeeper Serverless Functions
 * 
 * Provides AI-powered suggestion and route narration endpoints.
 * Designed to work with Netlify Functions, Vercel Edge Functions, or Cloudflare Workers.
 * 
 * Environment Variables:
 * - OPENAI_API_KEY: Your OpenAI API key
 * - ALLOWED_ORIGINS: Comma-separated list of allowed origins (optional)
 */

// Configuration
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 150;
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // Max requests per window

// Simple in-memory rate limiting (use Redis in production)
const rateLimitStore = new Map();

// Response cache (use Redis in production)
const responseCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Main handler function - adapts to different serverless platforms
 */
export default async function handler(request, context) {
    // Handle different serverless environments
    if (typeof request.json === 'function') {
        // Vercel/modern fetch API
        return await handleRequest(request);
    } else if (request.httpMethod) {
        // Netlify Functions
        return await handleNetlifyRequest(request, context);
    } else {
        // Cloudflare Workers
        return await handleCloudflareRequest(request);
    }
}

/**
 * Handle modern fetch API request (Vercel, etc.)
 */
async function handleRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // CORS headers
    const corsHeaders = getCorsHeaders(request.headers.get('origin'));
    
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers: corsHeaders });
    }
    
    // Route to appropriate handler
    try {
        let response;
        
        if (path.endsWith('/suggest')) {
            response = await handleSuggest(request);
        } else if (path.endsWith('/route')) {
            response = await handleRoute(request);
        } else {
            response = new Response(JSON.stringify({ error: 'Not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // Add CORS headers to response
        Object.entries(corsHeaders).forEach(([key, value]) => {
            response.headers.set(key, value);
        });
        
        return response;
        
    } catch (error) {
        console.error('Handler error:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
}

/**
 * Handle Netlify Functions request
 */
async function handleNetlifyRequest(event, context) {
    const corsHeaders = getCorsHeaders(event.headers.origin);
    
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: ''
        };
    }
    
    try {
        let result;
        
        if (event.path.endsWith('/suggest')) {
            result = await handleSuggestLogic(JSON.parse(event.body));
        } else if (event.path.endsWith('/route')) {
            result = await handleRouteLogic(JSON.parse(event.body));
        } else {
            return {
                statusCode: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Not found' })
            };
        }
        
        return {
            statusCode: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify(result)
        };
        
    } catch (error) {
        console.error('Netlify handler error:', error);
        return {
            statusCode: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Internal server error' })
        };
    }
}

/**
 * Handle suggestion request
 */
async function handleSuggest(request) {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    const body = await request.json();
    const result = await handleSuggestLogic(body);
    
    return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}

/**
 * Handle route narration request
 */
async function handleRoute(request) {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    const body = await request.json();
    const result = await handleRouteLogic(body);
    
    return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}

/**
 * Core suggestion logic
 */
async function handleSuggestLogic(body) {
    const { seed, suggestion, systemPrompt, model, temperature, maxTokens } = body;
    
    // Validate input
    if (!suggestion || !suggestion.text) {
        throw new Error('Missing suggestion text');
    }
    
    // Check rate limit
    const clientId = getClientId(body);
    if (!checkRateLimit(clientId)) {
        throw new Error('Rate limit exceeded');
    }
    
    // Check cache
    const cacheKey = getCacheKey('suggest', suggestion.id, systemPrompt);
    const cached = getFromCache(cacheKey);
    if (cached) {
        return { suggestion: cached };
    }
    
    // Prepare prompt
    const prompt = buildSuggestionPrompt(seed, suggestion, systemPrompt);
    
    // Call OpenAI
    const aiResponse = await callOpenAI(prompt, {
        model: model || DEFAULT_MODEL,
        temperature: temperature || DEFAULT_TEMPERATURE,
        max_tokens: maxTokens || DEFAULT_MAX_TOKENS
    });
    
    // Parse response
    const parsedResponse = parseSuggestionResponse(aiResponse);
    
    // Cache result
    setCache(cacheKey, parsedResponse);
    
    return { suggestion: parsedResponse };
}

/**
 * Core route narration logic
 */
async function handleRouteLogic(body) {
    const { path, systemPrompt, model, temperature, maxTokens } = body;
    
    // Validate input
    if (!path || !Array.isArray(path) || path.length === 0) {
        throw new Error('Missing or invalid path');
    }
    
    // Check rate limit
    const clientId = getClientId(body);
    if (!checkRateLimit(clientId)) {
        throw new Error('Rate limit exceeded');
    }
    
    // Check cache
    const pathIds = path.map(quote => quote.id).join('-');
    const cacheKey = getCacheKey('route', pathIds, systemPrompt);
    const cached = getFromCache(cacheKey);
    if (cached) {
        return { path: pathIds.split('-'), narration: cached };
    }
    
    // Prepare prompt
    const prompt = buildRoutePrompt(path, systemPrompt);
    
    // Call OpenAI
    const aiResponse = await callOpenAI(prompt, {
        model: model || DEFAULT_MODEL,
        temperature: temperature || DEFAULT_TEMPERATURE,
        max_tokens: maxTokens * 2 // Routes need more tokens
    });
    
    // Cache result
    setCache(cacheKey, aiResponse);
    
    return { 
        path: pathIds.split('-'), 
        narration: aiResponse 
    };
}

/**
 * Build suggestion prompt
 */
function buildSuggestionPrompt(seed, suggestion, systemPrompt) {
    const defaultSystemPrompt = `You are Mapkeeper, a thoughtful guide through a personal library of quotes and highlights. Your role is to suggest meaningful connections between ideas, helping users discover unexpected pathways through their own collected wisdom.

When suggesting a quote, provide:
1. A brief, compelling title for why this quote connects
2. A concise rationale (2-3 sentences) explaining the connection
3. Labels indicating the type of connection: "adjacent" (closely related), "oblique" (unexpected angle), or "wildcard" (surprising leap)

Be curious, insightful, and respectful of the personal nature of these collected thoughts.`;

    const systemMessage = systemPrompt || defaultSystemPrompt;
    
    const userMessage = `I'm exploring this quote:
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

Respond only with valid JSON.`;

    return [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage }
    ];
}

/**
 * Build route narration prompt
 */
function buildRoutePrompt(path, systemPrompt) {
    const defaultSystemPrompt = `You are Mapkeeper, a thoughtful guide through a personal library of quotes and highlights. Create a narrative that weaves together the user's journey through their selected quotes, highlighting the connections and themes that emerge.`;

    const systemMessage = systemPrompt || defaultSystemPrompt;
    
    const pathText = path.map((quote, index) => 
        `${index + 1}. "${quote.text}" — ${quote.author || 'Unknown'}, ${quote.book_title || 'Unknown Book'}`
    ).join('\n\n');
    
    const userMessage = `Here is the path I've taken through my quotes:

${pathText}

Please write a thoughtful narration (2-3 paragraphs) that weaves together this journey, highlighting the connections, themes, and insights that emerge from this particular sequence of quotes. Focus on the intellectual and emotional arc of the path.`;

    return [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage }
    ];
}

/**
 * Call OpenAI API
 */
async function callOpenAI(messages, options = {}) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OpenAI API key not configured');
    }
    
    const requestBody = {
        model: options.model || DEFAULT_MODEL,
        messages: messages,
        temperature: options.temperature || DEFAULT_TEMPERATURE,
        max_tokens: options.max_tokens || DEFAULT_MAX_TOKENS,
        response_format: messages[1].content.includes('JSON') ? { type: 'json_object' } : undefined
    };
    
    const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
        const error = await response.text();
        console.error('OpenAI API error:', error);
        throw new Error(`OpenAI API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
}

/**
 * Parse suggestion response from AI
 */
function parseSuggestionResponse(response) {
    try {
        const parsed = JSON.parse(response);
        return {
            title: parsed.title || 'Connected Ideas',
            rationale: parsed.rationale || 'These quotes share interesting connections.',
            labels: Array.isArray(parsed.labels) ? parsed.labels : ['adjacent']
        };
    } catch (error) {
        console.error('Error parsing AI response:', error);
        // Fallback response
        return {
            title: 'Connected Ideas',
            rationale: response.substring(0, 200) + '...',
            labels: ['adjacent']
        };
    }
}

/**
 * Get CORS headers
 */
function getCorsHeaders(origin) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
        ? process.env.ALLOWED_ORIGINS.split(',')
        : ['http://localhost:3000', 'http://localhost:8080', 'https://localhost:3000'];
    
    const isAllowed = !origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*');
    
    return {
        'Access-Control-Allow-Origin': isAllowed ? (origin || '*') : 'null',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
    };
}

/**
 * Simple rate limiting
 */
function checkRateLimit(clientId) {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW;
    
    // Clean old entries
    for (const [id, timestamps] of rateLimitStore.entries()) {
        const validTimestamps = timestamps.filter(t => t > windowStart);
        if (validTimestamps.length === 0) {
            rateLimitStore.delete(id);
        } else {
            rateLimitStore.set(id, validTimestamps);
        }
    }
    
    // Check current client
    const clientTimestamps = rateLimitStore.get(clientId) || [];
    const recentRequests = clientTimestamps.filter(t => t > windowStart);
    
    if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
        return false;
    }
    
    // Add current request
    recentRequests.push(now);
    rateLimitStore.set(clientId, recentRequests);
    
    return true;
}

/**
 * Get client ID for rate limiting
 */
function getClientId(body) {
    // In production, use IP address or user ID
    // For now, use a hash of the system prompt as a simple identifier
    return hashString(body.systemPrompt || 'default');
}

/**
 * Cache management
 */
function getCacheKey(type, id, systemPrompt) {
    const promptHash = hashString(systemPrompt || 'default');
    return `${type}:${id}:${promptHash}`;
}

function getFromCache(key) {
    const entry = responseCache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expires) {
        responseCache.delete(key);
        return null;
    }
    
    return entry.data;
}

function setCache(key, data) {
    responseCache.set(key, {
        data: data,
        expires: Date.now() + CACHE_TTL
    });
}

/**
 * Simple string hash function
 */
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
}

// Export for different platforms
export { handler };

// For Netlify Functions
export const netlifyHandler = handler;

// For Vercel
export const vercelHandler = handler;


