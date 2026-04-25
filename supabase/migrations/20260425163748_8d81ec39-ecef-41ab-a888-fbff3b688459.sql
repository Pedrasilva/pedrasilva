-- Refresh master proposal block templates so they no longer rely on
-- {{project_location}} / {{project_brief}} being present, and read
-- naturally when those values are empty.

UPDATE public.proposal_blocks
SET default_content = $$Dear {{client_name}},

Thank you for the opportunity to submit our proposal for **{{project_name}}**.

This document outlines our understanding of the project, the scope of services we propose to deliver, the team and methodology we will apply, and the corresponding fee structure.

We look forward to collaborating with you on this project.$$
WHERE slug = 'intro-standard';

UPDATE public.proposal_blocks
SET default_content = $$Dear {{client_name}},

It is a privilege to present our proposal for **{{project_name}}**.

We approach this commission as a close collaboration between client, design team and consultants, with shared authorship of the result. The following pages describe how we propose to structure the work, the level of involvement at each stage, and the fees associated with our services.

We would be delighted to discuss any aspect of this proposal in person.$$
WHERE slug = 'intro-collaborative';

UPDATE public.proposal_blocks
SET default_content = $$**{{project_name}}**

The scope, programme and ambition of the project are reflected in the services and fees described in the following sections.$$
WHERE slug = 'project-desc-generic';

UPDATE public.proposal_blocks
SET default_content = $$**{{project_name}}** is a hospitality project.

The project comprises guest accommodation together with associated public, food & beverage and back-of-house areas. Our role addresses both the architectural definition of the building and the coordinated design of the guest experience, ensuring a coherent identity across all spaces.$$
WHERE slug = 'project-desc-hotel';

UPDATE public.proposal_blocks
SET default_content = $$**{{project_name}}** is a residential project.

We address both the architectural definition of the building and the interior design of the principal living spaces, ensuring a coherent identity throughout.$$
WHERE slug = 'project-desc-residential';

UPDATE public.proposal_blocks
SET default_content = $$**{{project_name}}** is an office / workplace project.

Our role addresses both the architectural definition of the spaces and the coordinated design of the working environment, ensuring a coherent identity across all areas.$$
WHERE slug = 'project-desc-office';