"""RAG file parser — extracts text from uploaded .txt and .pdf files."""
from __future__ import annotations

import io
import logging

from PyPDF2 import PdfReader

logger = logging.getLogger(__name__)


def parse_text_file(content: bytes, filename: str) -> str:
    """Decode a plain text file."""
    try:
        return content.decode("utf-8")
    except UnicodeDecodeError:
        return content.decode("latin-1")


def parse_pdf_file(content: bytes, filename: str) -> str:
    """Extract text from all pages of a PDF."""
    reader = PdfReader(io.BytesIO(content))
    pages: list[str] = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages.append(text)
    return "\n\n".join(pages)


def parse_upload(content: bytes, filename: str) -> str:
    """Route to the correct parser based on file extension."""
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return parse_pdf_file(content, filename)
    # Default: treat as plain text (.txt, .md, .json, .csv, etc.)
    return parse_text_file(content, filename)
