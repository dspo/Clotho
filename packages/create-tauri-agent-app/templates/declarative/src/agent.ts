import { defineAgent, defineDomain } from '@dspo/tauri-agent';

export const domain = defineDomain({
  id: 'project-domain',
  resources: [{ resourceId: 'project-db', required: true }],
});

export const agent = defineAgent({
  id: 'declarative-demo',
  name: 'Declarative Demo',
  instructions: 'Use declared resources to answer questions safely.',
  resourceBindings: domain.resources,
});
