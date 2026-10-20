/** A problem with the book's file that the reader should see as a plain message. Kept apart so it doesn't pull in the EPUB/PDF engines. */
export class BookFileError extends Error {}
