# Weekly board – project notes

## What you'll see

A "Notas de projeto" section below the grid on /projects/week-plan, for the week shown. It is separate from planning: there is no draft or approval for notes, and saving a note never changes bookings.

```text
+------------------------------------------------------------------+
| [toolbar: week · project picker · stage · paint/erase · approve] |
| [grid: people × Mon–Fri AM/PM]                                   |
| [notices: outside dates, warnings]                               |
+------------------------------------------------------------------+
| NOTAS DE PROJETO — semana 19/10           [+ Adicionar nota]     |
| +-----------------------------+ +-----------------------------+  |
| | 2502 Uralchem IV            | | 2521 Escritórios BCG        |  |
| | Ana, Bernardo, Adalberto    | | Irene, Rita                 |  |
| | Estado [A decorrer v]       | | Estado [Obra v]             |  |
| | Notas  [.................]  | | Notas  [.................]  |  |
| | Data alvo [fim de out.]     | | Data alvo [ ]               |  |
| | Sinal [A terminar]          | | Sinal [Bloqueado]           |  |
| | da semana passada · editado | | editado por Luis · 17:05    |  |
| | por Irene · 16/10 10:12     | |                             |  |
| +-----------------------------+ +-----------------------------+  |
| (two columns on desktop, one on laptop/phone)                    |
| Extra notes (no slots): Assunção · Cabo Verde · Clínica Mint     |
+------------------------------------------------------------------+
| NOTAS DA SEMANA                                                  |
| Novos contactos | Recursos humanos | Registos de horas | Outros  |
+------------------------------------------------------------------+
```

- **Project boxes:** one appears automatically for every project with slots that week, in the same order as the toolbar's project list. The header shows the code and name, plus the people booked that week. The people list comes from the slots and cannot be edited.
- **Fields:** Estado (A decorrer / Obra / Stand by / A arrancar), Notas (several lines), Data alvo (free short text, optional) and Sinal (optional, free short text with "A terminar" and "Bloqueado" as suggestions).
- **"+ Adicionar nota de projeto":** pick a live project or an open CRM opportunity from the existing lists, never free text. Opportunities already linked to a project show as that project.
- **Notas da semana:** one box with the four fixed headings, each a text area.
- **Carry-over:** when a week has no saved note yet, the box shows last week's note marked "da semana passada". It is saved as this week's note only when someone edits or confirms it. Notes added by hand carry over the same way. Earlier weeks keep their own notes, so history stays.
- **Saving:** saves itself about 1.5s after typing stops. Each box shows "editado por X · quando". If two people edit at once, the later save wins and shows a "changed by X" warning instead of silently overwriting.

## Permissions

- **Read:** all PSA staff, the same people who can see the board today. Opening the notes from the menu doesn't widen access to the Projects module.
- **Edit:** admins and anyone given a new permission, "Editar notas da semana". Irene gets only that permission through the existing permissions screen. She does not become an admin, gets no planning-edit rights, and sees no costs. Later, any other planner can be given the same permission there too.

## Technical details

New table `pm_week_project_notes` (no change to any existing table):
- `id`, `week_start` (date, Monday), `kind` ('project' | 'opportunity' | 'week')
- `project_id` (nullable, references pm_projects), `opportunity_id` (nullable, references crm_opportunities)
- `status` ('a_decorrer' | 'obra' | 'stand_by' | 'a_arrancar', nullable)
- `notes`, `target_text`, `flag` (text, nullable)
- `week_topics` (jsonb, for the "week" row: novos_contactos / recursos_humanos / registos_horas / outros)
- `added_manually` (bool), `carried_from_week` (date, nullable)
- `revision` (int), `updated_by`, `updated_at`, `created_by`, `created_at`
- Rules (database checks):
  - exactly one of project/opportunity is set for project and opportunity notes, and neither for week notes
  - a status must be one of the four values
- Unique keys: (week_start, project_id), (week_start, opportunity_id), and one week row per week_start.
- Privileges: read/write for signed-in users, full access for the service role, TRUNCATE revoked. Access control (RLS):
  - **read:** `is_psa_staff()`, the same scope as the board
  - **write:** `is_psa_staff() AND (has_role(admin) OR has_module_permission(auth.uid(),'projects.edit_week_notes','all'))`
- One save function (`pm_week_note_save`) saves a box only if nobody changed it since it was opened, and records who saved it and when. A trigger stamps `updated_by` and `updated_at`.
- Carry-over is read-only on the browser side: the previous week's note is the fallback, and a row is written only when edited, so opening a week writes nothing.
- One migration file in both migration folders. The new permission key is registered where the existing module permissions are listed. Labels are in English and Portuguese.
- The section is a separate component below the grid. It never touches allocations, drafts or publication.
- Tests:
  - carry-over choice, ordering, people list from slots, permission gating
  - one check on a test week far in the future, cleaned up afterwards

## Estimate

Roughly 6–10 credits. That covers the new table, the notes section, the opportunity picker, the permission, translations, tests and the browser check. Questions about it later would cost a little more.
