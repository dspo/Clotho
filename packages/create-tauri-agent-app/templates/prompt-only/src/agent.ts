import { defineAgent } from '@dspo/tauri-agent';

export const agent = defineAgent({
  id: 'prompt-only-demo',
  name: 'Prompt Only Demo',
  instructions: 'Help the user using only prompt context.',
});
