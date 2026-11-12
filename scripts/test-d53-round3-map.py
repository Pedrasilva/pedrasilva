"""Read-only assertions of Luis's approved round-3 mapping rules."""
import csv
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROWS = list(csv.DictReader((ROOT / 'docs/numbering-final-mapping-2026-11-12-v4.csv').open()))
BY_ID = {r['ID']: r for r in ROWS}


class Round3Map(unittest.TestCase):
    def test_sequence(self):
        expected = {
            'd0b54eee-3490-4f14-bc16-75af3abcc7a3': '26019',
            'e27a851e-0765-4596-8cfe-2d23277724d8': '26020',
            '12960a08-0893-4d50-b07a-f769a0d5428f': '26021',
            'f6e19647-9456-44cf-b93d-5f172fdbe6d4': '26022',
            '56af3726-9ec4-4fde-ad02-84115b02a371': '26023',
            '918d0074-0cd5-4340-a8a4-7a46df591c95': '26024',
            '81dd4f3a-a686-4d22-9878-e1967bca9bb7': '26025',
            '01583ee0-d302-460e-a76b-bd3d7871184b': '26026',
            '62bd9f5b-8bac-42d1-9f9b-66f13ab1a30d': '26027',
            'a8e74883-c3c1-4c0b-ae92-151be57c9e75': '26028',
            '74d97e94-f9d9-49d7-b909-175b0bca8e76': '26029',
            'bbb638a0-ca2a-4236-87bd-38c68084874f': '26030',
        }
        for record_id, reference in expected.items():
            with self.subTest(record_id=record_id):
                self.assertEqual(BY_ID[record_id]['Referência proposta'], reference)

    def test_aethos_alias(self):
        self.assertEqual(BY_ID['d0b54eee-3490-4f14-bc16-75af3abcc7a3']['Aliases a reservar'], '2601')

    def test_ericeira_is_ruben(self):
        self.assertEqual(BY_ID['1743816f-122e-45aa-b7a3-e4dcdeba649d']['Referência proposta'], '2614')

    def test_miraflores_shared_identity(self):
        for record_id in ['72ef54b1-f386-45a7-89cd-d631f74ef739', '9cb13a62-d1a7-400a-ae88-53eec814e981']:
            self.assertEqual(BY_ID[record_id]['Referência proposta'], '2613')

    def test_cbd_is_south(self):
        self.assertEqual(BY_ID['51f4fc1c-4d2d-4c7f-b83b-e4d712f52a14']['Referência proposta'], '2618')

    def test_deleted_records_absent(self):
        for record_id in ['31949f67-93ea-4dea-a924-bbf6f539e416', '571a89f0-767b-4ea2-8b1b-98fe91f7f141']:
            self.assertNotIn(record_id, BY_ID)

    def test_mint_identity_without_revision_inference(self):
        for record_id in ['b37ab9e5-2f64-4468-a1b7-9153a9c46543', '37ebfc12-6717-474f-a5f4-5887706f7250']:
            self.assertEqual(BY_ID[record_id]['Referência proposta'], '2603')
            self.assertEqual(BY_ID[record_id]['Aliases a reservar'], '2678, 2680')

    def test_qa_no_aliases(self):
        qa = [r for r in ROWS if r['Referência proposta'].startswith('QA-')]
        self.assertEqual(len({r['Referência proposta'] for r in qa}), 26)
        self.assertTrue(all(r['Aliases a reservar'] == '—' for r in qa))
        orphans = [r for r in qa if r['Tipo'] == 'Documento' and r['Número atual'] == 'Sem quote']
        self.assertEqual(len(orphans), 10)


if __name__ == '__main__':
    unittest.main()