import { useEffect, useState } from 'react';
import { CircleAlert, RefreshCw } from 'lucide-react';
import type {
  ConfigFileCandidate,
  ConfigSelection,
  ResolvedConfig,
} from '@/types/assistant-runtime';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface ConfigDrawerProps {
  open: boolean;
  threadTitle: string | null;
  selection: ConfigSelection | null;
  resolvedConfig: ResolvedConfig | null;
  configFiles: ConfigFileCandidate[];
  loading: boolean;
  resolving: boolean;
  onOpenChange: (open: boolean) => void;
  onRefreshConfigFiles: () => void;
  onApply: (configFilePath: string, profile: string | null) => Promise<void>;
  onCreateThreadWithConfig: (
    configFilePath: string,
    profile: string | null,
  ) => Promise<void>;
}

export function ConfigDrawer({
  open,
  threadTitle,
  selection,
  resolvedConfig,
  configFiles,
  loading,
  resolving,
  onOpenChange,
  onRefreshConfigFiles,
  onApply,
  onCreateThreadWithConfig,
}: ConfigDrawerProps) {
  const [configFilePath, setConfigFilePath] = useState(selection?.configFilePath ?? '');
  const [profile, setProfile] = useState(selection?.profile ?? '');

  useEffect(() => {
    setConfigFilePath(selection?.configFilePath ?? '');
    setProfile(selection?.profile ?? '');
  }, [selection?.configFilePath, selection?.profile, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideDescription
        className="left-auto top-0 right-0 h-screen w-[min(560px,100vw)] max-w-none translate-x-0 translate-y-0 rounded-none border-l p-0"
      >
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Codex Config</DialogTitle>
            <DialogDescription>
              当前 thread: {threadTitle ?? '新对话'}。优先直接兼容 `.codex/config.toml`。
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 px-6 pt-2">
            <Badge variant="outline">{resolvedConfig?.provider || 'provider unknown'}</Badge>
            <Badge variant="outline">{resolvedConfig?.model || 'model unresolved'}</Badge>
            {resolvedConfig?.wireApi && (
              <Badge variant="secondary">{resolvedConfig.wireApi}</Badge>
            )}
          </div>

          <div className="space-y-4 px-6 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Config file path</label>
              <Input
                value={configFilePath}
                onChange={(event) => setConfigFilePath(event.target.value)}
                placeholder="~/.codex/config.toml"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Profile</label>
              <Input
                value={profile}
                onChange={(event) => setProfile(event.target.value)}
                placeholder="可选 profile 名称"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!configFilePath.trim() || resolving}
                onClick={() => void onApply(configFilePath.trim(), profile.trim() || null)}
              >
                应用到当前上下文
              </Button>
              <Button
                variant="outline"
                disabled={!configFilePath.trim() || resolving}
                onClick={() =>
                  void onCreateThreadWithConfig(
                    configFilePath.trim(),
                    profile.trim() || null,
                  )
                }
              >
                新建 thread 使用该配置
              </Button>
              <Button variant="ghost" size="sm" disabled={loading} onClick={onRefreshConfigFiles}>
                <RefreshCw className="h-4 w-4" />
                刷新候选
              </Button>
            </div>

            <div className="rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <CircleAlert className="h-4 w-4" />
                <span>
                  已有消息的 thread 若切换 config，后端可能拒绝继续复用该线程。需要切换配置时，通常更合理的是直接新建 thread。
                </span>
              </div>
            </div>
          </div>

          <Separator />

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-5 px-6 py-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Detected config files</h3>
                  {loading && <span className="text-xs text-muted-foreground">loading…</span>}
                </div>
                <div className="space-y-2">
                  {configFiles.length === 0 && (
                    <div className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                      还没有检测到可用配置文件。
                    </div>
                  )}
                  {configFiles.map((file) => (
                    <button
                      key={file.path}
                      className="w-full rounded-xl border px-3 py-3 text-left transition-colors hover:bg-muted/40"
                      onClick={() => setConfigFilePath(file.path)}
                    >
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{file.path}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            source: {file.source}
                          </div>
                        </div>
                        {file.isDefault && <Badge variant="secondary">default</Badge>}
                        {file.exists ? (
                          <Badge variant="outline">exists</Badge>
                        ) : (
                          <Badge variant="outline">missing</Badge>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {resolvedConfig && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Resolved config preview</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border p-3">
                      <div className="text-xs text-muted-foreground">Model</div>
                      <div className="mt-1 text-sm font-medium">{resolvedConfig.model}</div>
                    </div>
                    <div className="rounded-xl border p-3">
                      <div className="text-xs text-muted-foreground">Provider</div>
                      <div className="mt-1 text-sm font-medium">{resolvedConfig.provider}</div>
                    </div>
                    <div className="rounded-xl border p-3">
                      <div className="text-xs text-muted-foreground">Base URL</div>
                      <div className="mt-1 break-all text-sm font-medium">
                        {resolvedConfig.baseUrl || 'default'}
                      </div>
                    </div>
                    <div className="rounded-xl border p-3">
                      <div className="text-xs text-muted-foreground">API key env</div>
                      <div className="mt-1 text-sm font-medium">
                        {resolvedConfig.envKey || 'not set'}
                      </div>
                    </div>
                    <div className="rounded-xl border p-3">
                      <div className="text-xs text-muted-foreground">Approval</div>
                      <div className="mt-1 text-sm font-medium">
                        {resolvedConfig.approvalPolicy || 'default'}
                      </div>
                    </div>
                    <div className="rounded-xl border p-3">
                      <div className="text-xs text-muted-foreground">Sandbox</div>
                      <div className="mt-1 text-sm font-medium">
                        {resolvedConfig.sandboxMode || 'default'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
