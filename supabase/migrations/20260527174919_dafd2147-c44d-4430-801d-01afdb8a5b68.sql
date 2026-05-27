
UPDATE public.bank_accounts SET iban='PT50003507580000221923010', account_number='758002219230', bank_name='CGD' WHERE account_name='CGD';
UPDATE public.bank_accounts SET iban='PT50003300004523871673205', account_number='45238716732', bank_name='Millennium bcp' WHERE account_name='Millennium bcp';

INSERT INTO public.bank_accounts (account_name, bank_name, account_number, iban) VALUES
  ('MILLENNIUM BCP_Associados', 'Millennium bcp', '45344866160', 'PT50003300004534486616005'),
  ('CC BERNARDO NADAIS', 'Millennium bcp', '4864570125022000', NULL),
  ('CC JOANA ANJOS', 'Millennium bcp', '4864570125024000', NULL),
  ('CC IRENE CUNHA', 'Millennium bcp', '4864570125025000', NULL),
  ('CC RICARDO CONCEIÇÃO', 'Millennium bcp', '4864570125026000', NULL),
  ('CC LUIS PEDRA SILVA', 'Millennium bcp', '4988002215317000', NULL),
  ('COVERFLEX', 'Coverflex', NULL, 'ES2767071000640145181691')
ON CONFLICT DO NOTHING;
