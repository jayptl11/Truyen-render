import { useCallback, useEffect, useState } from 'react';
import type { Book } from '../../types/story';
import { getRecords, storageFailure, writeRecords } from '../../services/storage/database';
export function useBooks() {
  const [books, setBooks] = useState<Book[]>([]);
  useEffect(() => { let disposed = false; void getRecords<Book>('books').then(saved => { if (!disposed) setBooks(previous => { const result = new Map(saved.map(book => [book.id, book])); previous.forEach(book => result.set(book.id, book)); return [...result.values()]; }); }).catch(() => {}); return () => { disposed = true; }; }, []);
  const save = useCallback((book: Book) => { setBooks(previous => [book, ...previous.filter(item => item.id !== book.id)]); void writeRecords('books', [book]).catch(storageFailure); }, []);
  const remove = useCallback((id: string) => { setBooks(previous => previous.filter(item => item.id !== id)); void writeRecords('books', [], [id]).catch(storageFailure); }, []);
  return { books, save, remove };
}
