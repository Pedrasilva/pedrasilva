import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function WorkNumberSearch() {
  const { t } = useTranslation('crm');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const results = useQuery({ queryKey: ['work-number-search', query], enabled: open && query.trim().length > 1, queryFn: async () => {
    const { data, error } = await supabase.rpc('crm_work_search', { _query: query.trim() });
    if (error) throw error;
    return data;
  } });
  return <>
    <Button variant="ghost" size="icon" title={t('workNumbering.search')} aria-label={t('workNumbering.search')} onClick={() => setOpen(true)}><Search className="h-4 w-4" /></Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{t('workNumbering.search')}</DialogTitle></DialogHeader>
      <Input aria-label={t('workNumbering.search')} placeholder={t('workNumbering.search')} value={query} onChange={e => setQuery(e.target.value)} />
      <div className="max-h-80 overflow-y-auto space-y-2">
        {results.isFetching && <p>{t('common:loading')}</p>}
        {results.error && <p className="text-destructive">{results.error.message}</p>}
        {results.data?.map(r => <div key={`${r.kind}-${r.record_id}`} className="flex items-center gap-3 border-b py-2 text-sm">
          <span className="font-mono">{r.reference}</span>
          {r.kind === 'quote' ? <Link to="/crm/quotes/$quoteId" params={{ quoteId: r.record_id }} onClick={() => setOpen(false)}>{r.name}</Link>
            : r.kind === 'lead' ? <Link to="/crm/opportunities/$opportunityId" params={{ opportunityId: r.record_id }} onClick={() => setOpen(false)}>{r.name}</Link>
            : r.kind === 'project' ? <Link to="/projects/$projectId" params={{ projectId: r.record_id }} onClick={() => setOpen(false)}>{r.name}</Link>
            : <span>{r.name}</span>}
        </div>)}
      </div>
    </DialogContent></Dialog>
  </>;
}