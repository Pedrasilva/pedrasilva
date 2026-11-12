import {useQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {getProjectHourBudgets} from './hour-budget.functions';
import {useB1CacheScope} from './b1-projection';
export function useHourBudgets(projectId?:string){const scope=useB1CacheScope();const get=useServerFn(getProjectHourBudgets);return useQuery({queryKey:['project-hour-budgets',projectId,...scope],queryFn:()=>get({data:{projectId}}),staleTime:0});}