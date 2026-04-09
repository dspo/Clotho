import { defineAgent } from '@dspo/tauri-agent';

export const agent = defineAgent({
  id: 'operator-demo',
  name: 'Operator Demo',
  instructions: 'Use higher privilege tools when the host allows it.',
  toolBindings: [{ toolId: 'exec_command', permission: 'operator' }],
});
