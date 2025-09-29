#!/usr/bin/env python3
"""
Graph Builder for Mapkeeper

Builds a semantic similarity graph from quotes.jsonl using sentence embeddings.
Creates neighbors.json with top-k similar quotes for each quote.

Usage:
    python build_graph.py ../data/quotes.jsonl ../data/neighbors.json
    python build_graph.py ../data/quotes.jsonl ../data/neighbors.json --k 10 --model all-MiniLM-L6-v2

Requirements:
    pip install sentence-transformers numpy scikit-learn
"""

import json
import argparse
import numpy as np
from pathlib import Path
from typing import List, Dict, Tuple
import logging

try:
    from sentence_transformers import SentenceTransformer
    from sklearn.metrics.pairwise import cosine_similarity
    DEPENDENCIES_AVAILABLE = True
except ImportError:
    DEPENDENCIES_AVAILABLE = False

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class GraphBuilder:
    def __init__(self, model_name: str = 'all-MiniLM-L6-v2', k: int = 10):
        """
        Initialize the graph builder.
        
        Args:
            model_name: Name of the sentence transformer model to use
            k: Number of nearest neighbors to find for each quote
        """
        self.model_name = model_name
        self.k = k
        self.model = None
        
        if not DEPENDENCIES_AVAILABLE:
            raise ImportError(
                "Required dependencies not found. Please install:\n"
                "pip install sentence-transformers numpy scikit-learn"
            )
    
    def load_model(self):
        """Load the sentence transformer model."""
        logger.info(f"Loading model: {self.model_name}")
        self.model = SentenceTransformer(self.model_name)
        logger.info("Model loaded successfully")
    
    def load_quotes(self, quotes_path: str) -> List[Dict]:
        """Load quotes from JSONL file."""
        quotes = []
        with open(quotes_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    quotes.append(json.loads(line))
        
        logger.info(f"Loaded {len(quotes)} quotes")
        return quotes
    
    def prepare_texts(self, quotes: List[Dict]) -> List[str]:
        """Prepare text for embedding by combining quote text with metadata."""
        texts = []
        for quote in quotes:
            # Combine quote text with author and book for richer embeddings
            text_parts = [quote['text']]
            
            if quote.get('author'):
                text_parts.append(f"by {quote['author']}")
            
            if quote.get('book_title'):
                text_parts.append(f"from {quote['book_title']}")
            
            # Join parts with periods for natural sentence structure
            full_text = '. '.join(text_parts)
            texts.append(full_text)
        
        return texts
    
    def compute_embeddings(self, texts: List[str]) -> np.ndarray:
        """Compute embeddings for all texts."""
        logger.info("Computing embeddings...")
        
        # Process in batches to avoid memory issues
        batch_size = 32
        embeddings = []
        
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            batch_embeddings = self.model.encode(batch, show_progress_bar=True)
            embeddings.append(batch_embeddings)
            
            if i % (batch_size * 10) == 0:
                logger.info(f"Processed {i + len(batch)}/{len(texts)} texts")
        
        embeddings = np.vstack(embeddings)
        logger.info(f"Computed embeddings shape: {embeddings.shape}")
        return embeddings
    
    def find_neighbors(self, embeddings: np.ndarray, quotes: List[Dict]) -> Dict[str, List[str]]:
        """Find k nearest neighbors for each quote."""
        logger.info("Computing similarity matrix...")
        
        # Compute cosine similarity matrix
        similarity_matrix = cosine_similarity(embeddings)
        
        neighbors = {}
        
        for i, quote in enumerate(quotes):
            # Get similarity scores for this quote
            similarities = similarity_matrix[i]
            
            # Get indices of top-k similar quotes (excluding self)
            # Add 1 to k because we'll exclude the quote itself
            top_indices = np.argsort(similarities)[::-1][1:self.k + 1]
            
            # Get the quote IDs of the neighbors
            neighbor_ids = [quotes[idx]['id'] for idx in top_indices]
            neighbors[quote['id']] = neighbor_ids
        
        logger.info(f"Found {self.k} neighbors for each of {len(quotes)} quotes")
        return neighbors
    
    def save_neighbors(self, neighbors: Dict[str, List[str]], output_path: str):
        """Save neighbors to JSON file."""
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(neighbors, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Saved neighbors to: {output_path}")
    
    def build_lexical_index(self, quotes: List[Dict]) -> Dict[str, List[str]]:
        """Build a simple lexical index for keyword-based retrieval."""
        from collections import defaultdict
        import re
        
        # Simple word-based index
        word_to_quotes = defaultdict(set)
        
        for quote in quotes:
            # Extract words from quote text
            text = quote['text'].lower()
            words = re.findall(r'\b\w{4,}\b', text)  # Words with 4+ characters
            
            # Also include author and book words
            if quote.get('author'):
                author_words = re.findall(r'\b\w{3,}\b', quote['author'].lower())
                words.extend(author_words)
            
            if quote.get('book_title'):
                book_words = re.findall(r'\b\w{3,}\b', quote['book_title'].lower())
                words.extend(book_words)
            
            # Add quote to index for each word
            for word in set(words):  # Use set to avoid duplicates
                word_to_quotes[word].add(quote['id'])
        
        # Convert sets to lists and filter out very common words
        lexical_index = {}
        for word, quote_ids in word_to_quotes.items():
            quote_list = list(quote_ids)
            # Skip words that appear in too many quotes (likely stop words)
            if len(quote_list) < len(quotes) * 0.1:  # Less than 10% of quotes
                lexical_index[word] = quote_list
        
        logger.info(f"Built lexical index with {len(lexical_index)} terms")
        return lexical_index
    
    def save_lexical_index(self, index: Dict[str, List[str]], output_path: str):
        """Save lexical index to JSON file."""
        base_path = Path(output_path)
        index_path = base_path.parent / (base_path.stem + '_lexical.json')
        
        with open(index_path, 'w', encoding='utf-8') as f:
            json.dump(index, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Saved lexical index to: {index_path}")
    
    def print_sample_neighbors(self, quotes: List[Dict], neighbors: Dict[str, List[str]], n: int = 3):
        """Print sample neighbors for inspection."""
        logger.info(f"\nSample neighbors (showing {n} examples):")
        
        quote_dict = {q['id']: q for q in quotes}
        
        for i, quote in enumerate(quotes[:n]):
            print(f"\n--- Quote {i+1} ---")
            print(f"Text: \"{quote['text'][:100]}...\"")
            print(f"Author: {quote.get('author', 'Unknown')}")
            print(f"Book: {quote.get('book_title', 'Unknown')}")
            
            neighbor_ids = neighbors.get(quote['id'], [])
            print(f"\nTop {len(neighbor_ids)} neighbors:")
            
            for j, neighbor_id in enumerate(neighbor_ids[:5]):  # Show top 5
                neighbor = quote_dict.get(neighbor_id)
                if neighbor:
                    print(f"  {j+1}. \"{neighbor['text'][:80]}...\"")
                    print(f"     ({neighbor.get('author', 'Unknown')} - {neighbor.get('book_title', 'Unknown')})")
    
    def build(self, quotes_path: str, output_path: str, build_lexical: bool = True):
        """Main build process."""
        # Load quotes
        quotes = self.load_quotes(quotes_path)
        
        if len(quotes) == 0:
            raise ValueError("No quotes found in input file")
        
        # Load model
        self.load_model()
        
        # Prepare texts and compute embeddings
        texts = self.prepare_texts(quotes)
        embeddings = self.compute_embeddings(texts)
        
        # Find neighbors
        neighbors = self.find_neighbors(embeddings, quotes)
        
        # Save neighbors
        self.save_neighbors(neighbors, output_path)
        
        # Build and save lexical index if requested
        if build_lexical:
            lexical_index = self.build_lexical_index(quotes)
            self.save_lexical_index(lexical_index, output_path)
        
        # Print sample results
        self.print_sample_neighbors(quotes, neighbors)
        
        logger.info("Graph building completed successfully!")


def main():
    parser = argparse.ArgumentParser(description='Build semantic similarity graph for Mapkeeper')
    parser.add_argument('quotes_file', help='Path to quotes.jsonl file')
    parser.add_argument('output_file', help='Path to output neighbors.json file')
    parser.add_argument('--k', type=int, default=10, help='Number of neighbors to find (default: 10)')
    parser.add_argument('--model', default='all-MiniLM-L6-v2', 
                       help='Sentence transformer model to use (default: all-MiniLM-L6-v2)')
    parser.add_argument('--no-lexical', action='store_true', 
                       help='Skip building lexical index')
    
    args = parser.parse_args()
    
    if not Path(args.quotes_file).exists():
        print(f"Error: Quotes file '{args.quotes_file}' not found")
        return 1
    
    try:
        builder = GraphBuilder(model_name=args.model, k=args.k)
        builder.build(args.quotes_file, args.output_file, build_lexical=not args.no_lexical)
        return 0
    
    except ImportError as e:
        print(f"Error: {e}")
        return 1
    except Exception as e:
        logger.error(f"Error building graph: {e}")
        return 1


if __name__ == '__main__':
    exit(main())


