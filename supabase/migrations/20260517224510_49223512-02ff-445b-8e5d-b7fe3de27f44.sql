
DELETE FROM financial_document_payments WHERE document_id IN ('23415ca2-42fe-494b-9e7f-4c40f34d44b5','6c03ef64-5737-4d61-8142-4d99227dbbb7');
DELETE FROM financial_document_lines WHERE document_id IN ('23415ca2-42fe-494b-9e7f-4c40f34d44b5','6c03ef64-5737-4d61-8142-4d99227dbbb7');
DELETE FROM bank_transactions WHERE id IN ('929a1575-8c28-4937-aa91-fd36fac56dba','bfe3ec17-ee7b-4990-ad48-edde13e1cc93');
DELETE FROM financial_documents WHERE id IN ('23415ca2-42fe-494b-9e7f-4c40f34d44b5','6c03ef64-5737-4d61-8142-4d99227dbbb7');
DELETE FROM bank_accounts WHERE id = '8110e9e2-af94-44e2-ad2a-f116bb8ac4e0';
DELETE FROM companies WHERE id IN ('00cf33d1-56b9-4a90-868b-b5eca12df394','35716f74-fe95-4012-b21c-8d747a818f18');
