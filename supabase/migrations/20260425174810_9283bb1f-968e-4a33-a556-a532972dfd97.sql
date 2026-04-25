-- Inject {{project_brief}} as the first paragraph in all project-desc-* master blocks.
-- When the brief is empty, the runtime sanitizer collapses the blank line so only
-- the fallback scope sentence remains. project_location wording is intentionally
-- not reintroduced.

UPDATE public.proposal_blocks
SET default_content = E'**{{project_name}}**\n\n{{project_brief}}\n\nThe scope, programme and ambition of {{project_name}} are reflected in the services and fees described in the following sections.',
    updated_at = now()
WHERE slug = 'project-desc-generic';

UPDATE public.proposal_blocks
SET default_content = E'**{{project_name}}** is a residential project.\n\n{{project_brief}}\n\nWe address both the architectural definition of the building and the interior design of the principal living spaces, ensuring a coherent identity throughout.',
    updated_at = now()
WHERE slug = 'project-desc-residential';

UPDATE public.proposal_blocks
SET default_content = E'**{{project_name}}** is a hospitality project.\n\n{{project_brief}}\n\nThe project comprises guest accommodation together with associated public, food & beverage and back-of-house areas. Our role addresses both the architectural definition of the building and the coordinated design of the guest experience, ensuring a coherent identity across all spaces.',
    updated_at = now()
WHERE slug = 'project-desc-hotel';

UPDATE public.proposal_blocks
SET default_content = E'**{{project_name}}** is an office / workplace project.\n\n{{project_brief}}\n\nOur role addresses both the architectural definition of the spaces and the coordinated design of the working environment, ensuring a coherent identity across all areas.',
    updated_at = now()
WHERE slug = 'project-desc-office';