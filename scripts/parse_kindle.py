#!/usr/bin/env python3
"""
Kindle Highlights Parser for Mapkeeper

Parses Kindle highlights from TXT or CSV format and converts to quotes.jsonl format.
Each quote includes metadata like author, book title, location, and timestamp.

Supported formats:
- TXT: Standard Kindle "My Clippings.txt" export
- CSV: Custom exports with columns: Highlight, Book Title, Book Author, etc.

Usage:
    python parse_kindle.py input.txt output.jsonl
    python parse_kindle.py input.csv output.jsonl
    python parse_kindle.py "My Clippings.txt" ../data/quotes.jsonl
    python parse_kindle.py "highlights.csv" ../data/quotes.jsonl
"""

import json
import re
import sys
import csv
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional


class KindleParser:
    def __init__(self):
        self.quote_id_counter = 0
        
    def parse_file(self, input_path: str) -> List[Dict]:
        """Parse Kindle highlights file and return list of quote dictionaries."""
        file_path = Path(input_path)
        
        # Determine file format based on extension
        if file_path.suffix.lower() == '.csv':
            return self.parse_csv_file(input_path)
        else:
            return self.parse_txt_file(input_path)
    
    def parse_txt_file(self, input_path: str) -> List[Dict]:
        """Parse standard Kindle TXT file."""
        try:
            with open(input_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except UnicodeDecodeError:
            # Try with different encoding if UTF-8 fails
            with open(input_path, 'r', encoding='latin-1') as f:
                content = f.read()
        
        # Split by the separator line that Kindle uses
        sections = content.split('==========')
        quotes = []
        
        for section in sections:
            section = section.strip()
            if not section:
                continue
                
            quote = self.parse_section(section)
            if quote:
                quotes.append(quote)
        
        return quotes
    
    def parse_csv_file(self, input_path: str) -> List[Dict]:
        """Parse CSV file with Kindle highlights."""
        quotes = []
        
        try:
            with open(input_path, 'r', encoding='utf-8') as f:
                # Try to detect delimiter
                sample = f.read(1024)
                f.seek(0)
                
                # Common delimiters to try
                for delimiter in [',', '\t', ';']:
                    if sample.count(delimiter) > 0:
                        break
                else:
                    delimiter = ','  # Default to comma
                
                reader = csv.DictReader(f, delimiter=delimiter)
                
                for row_num, row in enumerate(reader, 1):
                    quote = self.parse_csv_row(row, row_num)
                    if quote:
                        quotes.append(quote)
                        
        except Exception as e:
            raise Exception(f"Error parsing CSV file: {e}")
        
        return quotes
    
    def parse_csv_row(self, row: Dict[str, str], row_num: int) -> Optional[Dict]:
        """Parse a single CSV row into a quote dictionary."""
        # Map common column names (case-insensitive)
        column_mapping = {
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
        }
        
        # Create case-insensitive lookup
        row_lower = {k.lower().strip(): v.strip() for k, v in row.items() if v}
        
        def find_column_value(field_name: str) -> str:
            """Find value for a field using flexible column matching."""
            possible_names = column_mapping.get(field_name, [field_name])
            for name in possible_names:
                if name in row_lower:
                    return row_lower[name]
            return ''
        
        # Extract the highlight text
        text = find_column_value('highlight')
        if not text or text.lower() in ['', 'n/a', 'null', 'none']:
            return None  # Skip empty highlights
        
        # Extract other fields
        book_title = find_column_value('book_title')
        author = find_column_value('author')
        location = find_column_value('location')
        note = find_column_value('note')
        color = find_column_value('color')
        tags = find_column_value('tags')
        location_type = find_column_value('location_type')
        highlighted_at = find_column_value('highlighted_at')
        amazon_id = find_column_value('amazon_id')
        
        # Parse location as integer if possible
        parsed_location = None
        if location:
            try:
                parsed_location = int(location)
            except ValueError:
                # Try to extract number from location string
                location_match = re.search(r'(\d+)', location)
                if location_match:
                    parsed_location = int(location_match.group(1))
        
        # Parse tags
        parsed_tags = []
        if tags:
            # Split by common separators
            tag_list = re.split(r'[,;|]', tags)
            parsed_tags = [tag.strip() for tag in tag_list if tag.strip()]
        
        # Parse timestamp
        parsed_timestamp = None
        if highlighted_at:
            parsed_timestamp = self.normalize_date(highlighted_at)
        
        # Generate unique ID
        self.quote_id_counter += 1
        quote_id = f"quote_{self.quote_id_counter:06d}"
        
        return {
            'id': quote_id,
            'text': text,
            'author': author,
            'book_title': book_title,
            'page': None,  # CSV format doesn't typically include page numbers
            'location': parsed_location,
            'added_at': parsed_timestamp,
            'tags': parsed_tags,
            'notes': note if note else None,
            'source': 'Kindle',
            'color': color if color else None,
            'location_type': location_type if location_type else None,
            'amazon_id': amazon_id if amazon_id else None
        }
    
    def parse_section(self, section: str) -> Optional[Dict]:
        """Parse a single highlight section."""
        lines = [line.strip() for line in section.split('\n') if line.strip()]
        
        if len(lines) < 3:
            return None
        
        # First line: Book title and author
        title_line = lines[0]
        book_title, author = self.parse_title_line(title_line)
        
        # Second line: Location/page info and timestamp
        meta_line = lines[1]
        location, page, added_at = self.parse_meta_line(meta_line)
        
        # Remaining lines: The actual highlight text
        text = '\n'.join(lines[2:]).strip()
        
        # Skip empty highlights or notes without text
        if not text or text.startswith('Note:'):
            return None
        
        # Generate unique ID
        self.quote_id_counter += 1
        quote_id = f"quote_{self.quote_id_counter:06d}"
        
        return {
            'id': quote_id,
            'text': text,
            'author': author,
            'book_title': book_title,
            'page': page,
            'location': location,
            'added_at': added_at,
            'tags': [],
            'notes': None,
            'source': 'Kindle'
        }
    
    def parse_title_line(self, line: str) -> tuple[str, str]:
        """Extract book title and author from the first line."""
        # Common patterns:
        # "Book Title (Author Name)"
        # "Book Title"
        # "Book Title by Author Name"
        
        # Try parentheses pattern first
        paren_match = re.match(r'^(.+?)\s*\(([^)]+)\)$', line)
        if paren_match:
            return paren_match.group(1).strip(), paren_match.group(2).strip()
        
        # Try "by" pattern
        by_match = re.match(r'^(.+?)\s+by\s+(.+)$', line, re.IGNORECASE)
        if by_match:
            return by_match.group(1).strip(), by_match.group(2).strip()
        
        # Default: treat entire line as title
        return line.strip(), ''
    
    def parse_meta_line(self, line: str) -> tuple[Optional[int], Optional[int], Optional[str]]:
        """Extract location, page, and timestamp from metadata line."""
        location = None
        page = None
        added_at = None
        
        # Extract location
        location_match = re.search(r'Location (\d+)', line)
        if location_match:
            location = int(location_match.group(1))
        
        # Extract page
        page_match = re.search(r'page (\d+)', line)
        if page_match:
            page = int(page_match.group(1))
        
        # Extract timestamp
        # Common patterns:
        # "Added on Monday, January 1, 2024 12:00:00 PM"
        # "Added on January 1, 2024"
        date_match = re.search(r'Added on (.+)$', line)
        if date_match:
            date_str = date_match.group(1).strip()
            added_at = self.normalize_date(date_str)
        
        return location, page, added_at
    
    def normalize_date(self, date_str: str) -> str:
        """Normalize various date formats to ISO format."""
        # Remove day of week if present
        date_str = re.sub(r'^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*', '', date_str)
        
        # Common patterns to try
        patterns = [
            '%B %d, %Y %I:%M:%S %p',  # January 1, 2024 12:00:00 PM
            '%B %d, %Y',              # January 1, 2024
            '%m/%d/%Y %I:%M:%S %p',   # 1/1/2024 12:00:00 PM
            '%m/%d/%Y',               # 1/1/2024
            '%Y-%m-%d %H:%M:%S',      # 2024-01-01 12:00:00
            '%Y-%m-%d',               # 2024-01-01
        ]
        
        for pattern in patterns:
            try:
                dt = datetime.strptime(date_str, pattern)
                return dt.isoformat()
            except ValueError:
                continue
        
        # If no pattern matches, return the original string
        return date_str
    
    def save_jsonl(self, quotes: List[Dict], output_path: str):
        """Save quotes to JSONL format."""
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            for quote in quotes:
                f.write(json.dumps(quote, ensure_ascii=False) + '\n')
    
    def print_stats(self, quotes: List[Dict]):
        """Print parsing statistics."""
        print(f"\nParsing Results:")
        print(f"Total quotes: {len(quotes)}")
        
        if not quotes:
            return
        
        # Count by author
        authors = {}
        books = {}
        for quote in quotes:
            author = quote.get('author', 'Unknown')
            book = quote.get('book_title', 'Unknown')
            authors[author] = authors.get(author, 0) + 1
            books[book] = books.get(book, 0) + 1
        
        print(f"Unique authors: {len(authors)}")
        print(f"Unique books: {len(books)}")
        
        # Top authors
        if authors:
            top_authors = sorted(authors.items(), key=lambda x: x[1], reverse=True)[:5]
            print(f"\nTop authors:")
            for author, count in top_authors:
                print(f"  {author}: {count} quotes")
        
        # Date range
        dates = [q.get('added_at') for q in quotes if q.get('added_at')]
        if dates:
            try:
                parsed_dates = []
                for date_str in dates:
                    try:
                        if 'T' in date_str:
                            dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                        else:
                            dt = datetime.fromisoformat(date_str)
                        parsed_dates.append(dt)
                    except:
                        continue
                
                if parsed_dates:
                    earliest = min(parsed_dates)
                    latest = max(parsed_dates)
                    print(f"\nDate range: {earliest.date()} to {latest.date()}")
            except:
                pass


def main():
    if len(sys.argv) != 3:
        print("Usage: python parse_kindle.py <input_file> <output_file>")
        print("\nSupported input formats:")
        print("  TXT: Standard Kindle 'My Clippings.txt' export")
        print("  CSV: Custom exports with columns like 'Highlight', 'Book Title', etc.")
        print("\nExamples:")
        print("  python parse_kindle.py 'My Clippings.txt' ../data/quotes.jsonl")
        print("  python parse_kindle.py 'highlights.csv' ../data/quotes.jsonl")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    
    if not Path(input_file).exists():
        print(f"Error: Input file '{input_file}' not found")
        sys.exit(1)
    
    # Detect file format
    file_path = Path(input_file)
    file_format = "CSV" if file_path.suffix.lower() == '.csv' else "TXT"
    
    print(f"Parsing Kindle highlights from: {input_file}")
    print(f"Detected format: {file_format}")
    
    parser = KindleParser()
    
    try:
        quotes = parser.parse_file(input_file)
    except Exception as e:
        print(f"Error parsing file: {e}")
        print("\nTroubleshooting tips:")
        if file_format == "CSV":
            print("- Ensure your CSV has a header row with column names")
            print("- Check that the 'Highlight' column contains the quote text")
            print("- Verify the file encoding is UTF-8")
        else:
            print("- Ensure this is a valid Kindle 'My Clippings.txt' file")
            print("- Check the file encoding (try UTF-8 or Latin-1)")
        sys.exit(1)
    
    if not quotes:
        print("No quotes found in the input file")
        if file_format == "CSV":
            print("Check that your CSV has:")
            print("- A 'Highlight' column with quote text")
            print("- Non-empty highlight values")
        sys.exit(1)
    
    parser.save_jsonl(quotes, output_file)
    parser.print_stats(quotes)
    
    print(f"\nSaved {len(quotes)} quotes to: {output_file}")
    print(f"Format: {file_format}")
    
    if file_format == "CSV":
        print("\nCSV-specific features preserved:")
        sample_quote = quotes[0]
        if sample_quote.get('color'):
            print(f"- Highlight colors (e.g., '{sample_quote['color']}')")
        if sample_quote.get('tags'):
            print(f"- Tags (e.g., {sample_quote['tags']})")
        if sample_quote.get('amazon_id'):
            print("- Amazon Book IDs")
        if sample_quote.get('location_type'):
            print("- Location types")


if __name__ == '__main__':
    main()


