import { RefreshCw, Wrench } from 'lucide-react';
import type {
  ResolvedConfig,
  RuntimeCatalog,
} from '@/types/assistant-runtime';
import type { AssistantInspectorTab } from '@/stores/assistant/assistant-overlay-store';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface InspectorDrawerProps {
  open: boolean;
  tab: AssistantInspectorTab;
  catalog: RuntimeCatalog | null;
  loading: boolean;
  connectionState: string;
  resolvedConfig: ResolvedConfig | null;
  debugMessages: string[];
  onOpenChange: (open: boolean) => void;
  onTabChange: (tab: AssistantInspectorTab) => void;
  onRefresh: () => void;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function formatAuditTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export function InspectorDrawer({
  open,
  tab,
  catalog,
  loading,
  connectionState,
  resolvedConfig,
  debugMessages,
  onOpenChange,
  onTabChange,
  onRefresh,
}: InspectorDrawerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideDescription
        className="left-auto top-0 right-0 h-screen w-[min(720px,100vw)] max-w-none translate-x-0 translate-y-0 rounded-none border-l p-0"
      >
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" />
              Assistant Inspector
            </DialogTitle>
            <DialogDescription>
              只用于查看 native tools、repo skills、runtime 状态与调试信息。
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between px-6 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={connectionState === 'connected' ? 'secondary' : 'outline'}>
                {connectionState === 'connected' ? 'Runtime 已连接' : connectionState}
              </Badge>
              {resolvedConfig?.provider && <Badge variant="outline">{resolvedConfig.provider}</Badge>}
              {resolvedConfig?.model && <Badge variant="outline">{resolvedConfig.model}</Badge>}
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={loading}
              onClick={onRefresh}
            >
              <RefreshCw className="h-4 w-4" />
              刷新
            </Button>
          </div>

          <Tabs
            value={tab}
            onValueChange={(value) => onTabChange(value as AssistantInspectorTab)}
            className="min-h-0 flex-1 px-6 pb-6 pt-4"
          >
            <TabsList variant="line" className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="runtime">Runtime</TabsTrigger>
              <TabsTrigger value="tools">Tools</TabsTrigger>
              <TabsTrigger value="skills">Skills</TabsTrigger>
              <TabsTrigger value="integrations">Integrations</TabsTrigger>
            </TabsList>

            <TabsContent value="runtime" className="min-h-0">
              <ScrollArea className="h-full">
                <div className="space-y-4 py-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border p-4">
                      <div className="text-xs text-muted-foreground">Provider</div>
                      <div className="mt-1 text-sm font-medium">
                        {resolvedConfig?.provider ?? '未解析'}
                      </div>
                    </div>
                    <div className="rounded-xl border p-4">
                      <div className="text-xs text-muted-foreground">Wire API</div>
                      <div className="mt-1 text-sm font-medium">
                        {resolvedConfig?.wireApi ?? '未知'}
                      </div>
                    </div>
                    <div className="rounded-xl border p-4">
                      <div className="text-xs text-muted-foreground">Config File</div>
                      <div className="mt-1 break-all text-sm font-medium">
                        {resolvedConfig?.configFilePath ?? '默认上下文'}
                      </div>
                    </div>
                    <div className="rounded-xl border p-4">
                      <div className="text-xs text-muted-foreground">Profile</div>
                      <div className="mt-1 text-sm font-medium">
                        {resolvedConfig?.profile ?? 'default'}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-sm font-medium">Debug Messages</h3>
                    {debugMessages.length === 0 ? (
                      <EmptyState text="当前还没有 runtime debug 消息。" />
                    ) : (
                      <div className="space-y-2">
                        {debugMessages.map((message, index) => (
                          <div
                            key={`${index}-${message}`}
                            className="rounded-xl border bg-muted/20 px-4 py-3 text-sm leading-6 whitespace-pre-wrap"
                          >
                            {message}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="tools" className="min-h-0">
              <ScrollArea className="h-full">
                <div className="space-y-4 py-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border p-4">
                      <div className="text-xs text-muted-foreground">Native Tools</div>
                      <div className="mt-1 text-sm font-medium">
                        {catalog?.tools.length ?? 0}
                      </div>
                    </div>
                    <div className="rounded-xl border p-4">
                      <div className="text-xs text-muted-foreground">Recent Tool Audits</div>
                      <div className="mt-1 text-sm font-medium">
                        {catalog?.toolAudits.length ?? 0}
                      </div>
                    </div>
                  </div>

                  {catalog?.toolAuditLogPath && (
                    <div className="rounded-xl border p-4">
                      <div className="text-xs text-muted-foreground">Audit Log Path</div>
                      <div className="mt-2 break-all text-sm">{catalog.toolAuditLogPath}</div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Tool Registry</h3>
                    {!catalog?.tools.length && <EmptyState text="当前没有可见的 native tools。" />}
                    {catalog?.tools.map((tool) => (
                      <div key={tool.name} className="rounded-xl border p-4">
                        <div className="text-sm font-medium">{tool.name}</div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          {tool.description}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Recent Audit Trail</h3>
                    {!catalog?.toolAudits.length && (
                      <EmptyState text="当前还没有 native tool 审计记录。" />
                    )}
                    {catalog?.toolAudits.map((audit) => (
                      <div key={audit.auditId} className="rounded-xl border p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-medium">{audit.toolName}</div>
                          <Badge variant={audit.success ? 'secondary' : 'destructive'}>
                            {audit.success ? 'success' : 'failed'}
                          </Badge>
                          <Badge variant="outline">{audit.durationMs} ms</Badge>
                        </div>
                        <div className="mt-2 text-sm leading-6 whitespace-pre-wrap">
                          {audit.summary}
                        </div>
                        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                          <div>Executed: {formatAuditTimestamp(audit.executedAt)}</div>
                          <div>Call ID: {audit.callId}</div>
                          <div>
                            Thread:
                            {' '}
                            {audit.localThreadId ?? audit.runtimeThreadId}
                            {' '}
                            · Turn:
                            {' '}
                            {audit.localTurnId ?? audit.runtimeTurnId}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="skills" className="min-h-0">
              <ScrollArea className="h-full">
                <div className="space-y-2 py-4">
                  {!catalog?.skills.length && <EmptyState text="当前没有发现 repo skills。" />}
                  {catalog?.skills.map((skill) => (
                    <div key={skill.path} className="rounded-xl border p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-medium">{skill.name}</div>
                        <Badge variant="outline">repo skill</Badge>
                      </div>
                      {skill.description && (
                        <div className="mt-2 text-sm text-muted-foreground">
                          {skill.description}
                        </div>
                      )}
                      <div className="mt-2 break-all text-xs text-muted-foreground">
                        {skill.path}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="integrations" className="min-h-0">
              <ScrollArea className="h-full">
                <div className="space-y-2 py-4">
                  {!catalog?.integrations.length && (
                    <EmptyState text="当前未发现需要展示的外部 integrations。首版以 embedded runtime + native tools 为主。" />
                  )}
                  {catalog?.integrations.map((integration) => (
                    <div key={`${integration.kind}:${integration.name}`} className="rounded-xl border p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-medium">{integration.name}</div>
                        <Badge variant="outline">{integration.kind}</Badge>
                        <Badge variant="secondary">{integration.status}</Badge>
                      </div>
                      {integration.detail && (
                        <div className="mt-2 text-sm text-muted-foreground">
                          {integration.detail}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
