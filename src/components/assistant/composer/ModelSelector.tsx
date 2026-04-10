import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';

const DEFAULT_VALUE = '__default__';
const CUSTOM_VALUE = '__custom__';
const COMMON_MODELS = ['gpt-5.4', 'gpt-5', 'gpt-5-mini', 'o4-mini'];

interface ModelSelectorProps {
  value: string;
  resolvedModel: string | null;
  onChange: (value: string) => void;
}

export function ModelSelector({
  value,
  resolvedModel,
  onChange,
}: ModelSelectorProps) {
  const normalizedValue = value.trim();
  const presetValues = [
    resolvedModel?.trim() ?? '',
    ...COMMON_MODELS,
  ].filter((candidate, index, items) => candidate.length > 0 && items.indexOf(candidate) === index);

  const selectValue = normalizedValue.length === 0
    ? DEFAULT_VALUE
    : presetValues.includes(normalizedValue)
      ? normalizedValue
      : CUSTOM_VALUE;

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
      <Select
        value={selectValue}
        onValueChange={(nextValue) => {
          if (nextValue === DEFAULT_VALUE) {
            onChange('');
            return;
          }

          if (nextValue === CUSTOM_VALUE) {
            if (normalizedValue.length === 0 || presetValues.includes(normalizedValue)) {
              onChange('');
            }
            return;
          }

          onChange(nextValue);
        }}
      >
        <SelectTrigger className="h-9 w-full sm:w-52">
          <SelectValue placeholder="选择模型" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>当前上下文</SelectLabel>
            <SelectItem value={DEFAULT_VALUE}>
              {resolvedModel ? `跟随配置默认值 (${resolvedModel})` : '跟随配置默认值'}
            </SelectItem>
          </SelectGroup>
          {presetValues.length > 0 && <SelectSeparator />}
          <SelectGroup>
            <SelectLabel>常用模型</SelectLabel>
            {presetValues.map((model) => (
              <SelectItem key={model} value={model}>
                {model}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectSeparator />
          <SelectItem value={CUSTOM_VALUE}>自定义模型…</SelectItem>
        </SelectContent>
      </Select>

      {selectValue === CUSTOM_VALUE && (
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="输入自定义模型名"
          className="h-9 w-full sm:w-56"
        />
      )}
    </div>
  );
}
