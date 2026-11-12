"""Offline checks: no browser, database writes or persisted fixtures."""
import importlib.util
import unittest
from pathlib import Path
import subprocess
import json
spec=importlib.util.spec_from_file_location('fixture',Path(__file__).with_name('proposal-test-fixture.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Isolation(unittest.TestCase):
 def run_guard(self, fixture, document, snapshot=None):
  js='''const f=JSON.parse(process.argv[1]);const document=JSON.parse(process.argv[2]);const snapshot=JSON.parse(process.argv[3]);const chain={select(){return this},eq(){return this},single:async()=>({data:document}),in:async()=>({data:snapshot?[{snapshot}]:[]}),then(resolve){resolve({data:[document]})}};const s={from:()=>chain};const guard='''+module.GUARD.replace("const {supabase:s}=await import('/src/integrations/supabase/client.ts');",'')+''';guard(f).then(()=>console.log('PASS')).catch(e=>{console.log(e.message);process.exit(1)});'''
  return subprocess.run(['node','-e',js,json.dumps(fixture),json.dumps(document),json.dumps(snapshot)],capture_output=True,text=True)
 def test_same_quote_aborts(self):
  r=self.run_guard({'quoteId':'real','sourceQuoteId':'real','id':'test'},{'id':'test','quote_id':'real'})
  self.assertNotEqual(r.returncode,0);self.assertIn('Unsafe fixture quote',r.stdout)
 def test_wrong_document_link_aborts(self):
  r=self.run_guard({'quoteId':'copy','sourceQuoteId':'real','id':'test'},{'id':'test','quote_id':'real'})
  self.assertNotEqual(r.returncode,0);self.assertIn('real quote',r.stdout)
 def test_snapshot_real_quote_aborts(self):
  r=self.run_guard({'quoteId':'copy','sourceQuoteId':'real','id':'test'},{'id':'test','quote_id':'copy'},{'proposal':{'quote_id':'real'}})
  self.assertNotEqual(r.returncode,0);self.assertIn('revision points',r.stdout)
 def test_isolated_quote_passes(self):
  r=self.run_guard({'quoteId':'copy','sourceQuoteId':'real','id':'test'},{'id':'test','quote_id':'copy'},{'proposal':{'quote_id':'copy'},'quote_data':{'raw':{'quote':{'id':'copy'}}}})
  self.assertEqual(r.returncode,0,r.stdout+r.stderr)
if __name__=='__main__':unittest.main()
