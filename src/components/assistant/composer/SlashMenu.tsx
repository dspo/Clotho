import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';

export interface SlashMenuItem {
  id: string;
  group: string;
  label: string;
  description: string;
  shortcut?: string;
}

interface SlashMenuProps {
  open: boolean;
  items: SlashMenuItem[];
  onOpenChange: (open: boolean) => void;
  onSelect: (itemId: string) => void;
}

export function SlashMenu({
  open,
  items,
  onOpenChange,
  onSelect,
}: SlashMenuProps) {
  const groups = items.reduce<Record<string, SlashMenuItem[]>>((result, item) => {
    result[item.group] ??= [];
    result[item.group].push(item);
    return result;
  }, {});

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Slash Menu"
      description="搜索 Agent 指令、模式切换和调试入口。"
      className="max-w-[min(420px,calc(100vw-2rem))]"
    >
      <CommandInput placeholder="搜索指令或调试入口…" />
      <CommandList className="max-h-72">
        <CommandEmpty>没有匹配项。</CommandEmpty>
        {Object.entries(groups).map(([group, groupItems]) => (
          <CommandGroup key={group} heading={group}>
            {groupItems.map((item) => (
              <CommandItem
                key={item.id}
                value={`${item.label} ${item.description} ${item.id}`}
                onSelect={() => {
                  onSelect(item.id);
                  onOpenChange(false);
                }}
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{item.label}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {item.description}
                  </span>
                </div>
                {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
