# Persisted proposal test isolation

- Persisted composer tests use the shared separate-quote fixture factory and validate document/snapshot quote links before mutations; never auto-clean by title or touch real quote documents. Why: disposable documents are safe only inside independently identified quotes.
