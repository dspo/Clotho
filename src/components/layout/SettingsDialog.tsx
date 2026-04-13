import { useEffect, useState } from 'react';
import { Loader2, RotateCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { assistantRuntimeClient } from '@/services/assistant-runtime-client';
import { useSettingsStore } from '@/stores/settings-store';
import type { DailyAutomationStatus } from '@/types/assistant-runtime';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

type SettingsTab = 'mcp' | 'assistant';

const NAV_ITEMS: { id: SettingsTab; label: string }[] = [
  { id: 'assistant', label: 'Assistant' },
  { id: 'mcp', label: 'MCP' },
];

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AppSettingRow {
  key: string;
  value: string;
  updated_at: string;
}

interface McpServerStatus {
  enabled: boolean;
  url: string;
  bindAddr: string;
  hasServerTask: boolean;
  running: boolean;
  state: 'disabled' | 'running' | 'starting' | 'stopped' | string;
  message?: string | null;
}

function Toggle({
  checked,
  disabled,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-muted',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('assistant');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0">
        <div className="flex h-[420px]">
          {/* Left nav */}
          <div className="w-[160px] border-r bg-muted/30 p-4 flex flex-col gap-1">
            <DialogHeader className="mb-3">
              <DialogTitle className="text-base">Settings</DialogTitle>
              <DialogDescription className="sr-only">Application settings</DialogDescription>
            </DialogHeader>
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm text-left transition-colors',
                  activeTab === item.id
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
                onClick={() => setActiveTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Right panel */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeTab === 'assistant' && <AssistantAutomationPanel />}
            {activeTab === 'mcp' && <McpPanel />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function McpPanel() {
  const mcpUrl = useSettingsStore((s) => s.mcpUrl);
  const setMcpUrl = useSettingsStore((s) => s.setMcpUrl);
  const mcpEnabled = useSettingsStore((s) => s.mcpEnabled);
  const setMcpEnabled = useSettingsStore((s) => s.setMcpEnabled);
  const [draftUrl, setDraftUrl] = useState(mcpUrl);
  const [draftEnabled, setDraftEnabled] = useState(mcpEnabled);
  const [status, setStatus] = useState<McpServerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [dirty, setDirty] = useState(false);

  const refreshStatus = async () => {
    const latest = await invoke<McpServerStatus>('get_mcp_server_status');
    setStatus(latest);
    return latest;
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const rows = await invoke<AppSettingRow[]>('get_settings');
        const settingsMap = Object.fromEntries(rows.map((row) => [row.key, row.value]));
        const nextUrl = settingsMap.mcp_url ?? mcpUrl;
        const nextEnabled =
          settingsMap.mcp_enabled === 'true'
            ? true
            : settingsMap.mcp_enabled === 'false'
              ? false
              : mcpEnabled;

        if (!active) return;
        setDraftUrl(nextUrl);
        setDraftEnabled(nextEnabled);
        setMcpUrl(nextUrl);
        setMcpEnabled(nextEnabled);
        setDirty(false);
        await refreshStatus();
      } catch (error) {
        if (!active) return;
        toast.error('Failed to load MCP settings');
        console.error(error);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const pollUntilRunning = async (initial: McpServerStatus): Promise<McpServerStatus> => {
    if (initial.state !== 'starting') return initial;
    let latest = initial;
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 500));
      latest = await invoke<McpServerStatus>('get_mcp_server_status');
      setStatus(latest);
      if (latest.state === 'running' || latest.state === 'disabled' || latest.state === 'stopped') break;
    }
    return latest;
  };

  const onApply = async () => {
    setSaving(true);
    try {
      const normalizedUrl = draftUrl.trim() || 'http://0.0.0.0:7400/mcp';
      await invoke('update_settings', { key: 'mcp_url', value: normalizedUrl });
      await invoke('update_settings', { key: 'mcp_enabled', value: String(draftEnabled) });
      setMcpUrl(normalizedUrl);
      setMcpEnabled(draftEnabled);
      const next = await invoke<McpServerStatus>('restart_mcp_server');
      setStatus(next);
      setDirty(false);
      const final = await pollUntilRunning(next);
      if (final.state === 'disabled') {
        toast.success('MCP disabled and stopped');
      } else if (final.state === 'running') {
        toast.success('MCP restarted successfully');
      } else {
        toast.warning('MCP restart requested, server is still starting');
      }
    } catch (error) {
      toast.error('Failed to apply MCP settings');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const onRestart = async () => {
    if (dirty) {
      toast.info('You have unsaved changes, please apply first');
      return;
    }
    setRestarting(true);
    try {
      const next = await invoke<McpServerStatus>('restart_mcp_server');
      setStatus(next);
      const final = await pollUntilRunning(next);
      if (final.state === 'disabled') {
        toast.message('MCP is disabled');
      } else if (final.state === 'running') {
        toast.success('MCP restarted successfully');
      } else {
        toast.warning('MCP restart requested, server is still starting');
      }
    } catch (error) {
      toast.error('Failed to restart MCP server');
      console.error(error);
    } finally {
      setRestarting(false);
    }
  };

  const statusLabel =
    status?.state === 'running'
      ? 'Running'
      : status?.state === 'starting'
        ? 'Starting'
        : status?.state === 'disabled'
          ? 'Disabled'
          : 'Stopped';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-4">MCP Configuration</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mcp-url">URL</Label>
            <Input
              id="mcp-url"
              value={draftUrl}
              onChange={(e) => {
                setDraftUrl(e.target.value);
                setDirty(true);
              }}
              disabled={loading || saving || restarting}
              placeholder="http://0.0.0.0:7400/mcp"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label>Enabled</Label>
            <Toggle
              checked={draftEnabled}
              disabled={loading || saving || restarting}
              onToggle={() => {
                setDraftEnabled(!draftEnabled);
                setDirty(true);
              }}
            />
          </div>

          <div className="rounded-md border p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Server Status</span>
              <span
                className={cn(
                  'text-xs px-2 py-0.5 rounded-full',
                  status?.state === 'running' && 'bg-emerald-500/15 text-emerald-600',
                  status?.state === 'starting' && 'bg-amber-500/15 text-amber-600',
                  status?.state === 'disabled' && 'bg-slate-500/15 text-slate-600',
                  (!status || status?.state === 'stopped') && 'bg-rose-500/15 text-rose-600',
                )}
              >
                {loading ? 'Loading...' : statusLabel}
              </span>
            </div>
            <p className="text-xs text-muted-foreground break-all">
              Endpoint: {status?.url ?? draftUrl}
            </p>
            {status?.message && <p className="text-xs text-muted-foreground">{status.message}</p>}
            {dirty && <p className="text-xs text-amber-600">You have unapplied changes.</p>}
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={onApply}
              disabled={loading || saving || restarting || !dirty}
            >
              {(saving || restarting) && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {!saving && !restarting && <RotateCw className="h-4 w-4 mr-1.5" />}
              Apply & Restart
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onRestart}
              disabled={loading || saving || restarting || dirty}
            >
              {restarting ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <RotateCw className="h-4 w-4 mr-1.5" />
              )}
              Restart
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssistantAutomationPanel() {
  const [status, setStatus] = useState<DailyAutomationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [draftLocalTime, setDraftLocalTime] = useState('09:00');
  const [draftConfigFilePath, setDraftConfigFilePath] = useState('');
  const [draftConfigProfile, setDraftConfigProfile] = useState('');

  const refreshStatus = async () => {
    const next = await assistantRuntimeClient.getDailyAutomationStatus();
    setStatus(next);
    return next;
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const rows = await invoke<AppSettingRow[]>('get_settings');
        const settingsMap = Object.fromEntries(rows.map((row) => [row.key, row.value]));
        const automationStatus = await refreshStatus();
        if (!active) return;

        setDraftEnabled(
          settingsMap.assistant_automation_enabled === 'true'
            ? true
            : settingsMap.assistant_automation_enabled === 'false'
              ? false
              : automationStatus.config.enabled,
        );
        setDraftLocalTime(
          settingsMap.assistant_automation_local_time
            ?? automationStatus.config.localTime
            ?? '09:00',
        );
        setDraftConfigFilePath(
          settingsMap.assistant_automation_config_file_path
            ?? automationStatus.config.configFilePath
            ?? '',
        );
        setDraftConfigProfile(
          settingsMap.assistant_automation_config_profile
            ?? automationStatus.config.configProfile
            ?? '',
        );
        setDirty(false);
      } catch (error) {
        if (!active) return;
        toast.error('加载助手自动化设置失败');
        console.error(error);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!status?.activeRun) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshStatus();
    }, 5000);

    return () => window.clearInterval(timer);
  }, [status?.activeRun?.runId, status?.activeRun?.status]);

  const onApply = async () => {
    setSaving(true);
    try {
      const normalizedTime = draftLocalTime.trim() || '09:00';
      await invoke('update_settings', {
        key: 'assistant_automation_enabled',
        value: String(draftEnabled),
      });
      await invoke('update_settings', {
        key: 'assistant_automation_local_time',
        value: normalizedTime,
      });
      await invoke('update_settings', {
        key: 'assistant_automation_config_file_path',
        value: draftConfigFilePath.trim(),
      });
      await invoke('update_settings', {
        key: 'assistant_automation_config_profile',
        value: draftConfigProfile.trim(),
      });

      await refreshStatus();
      setDirty(false);
      toast.success('助手自动化设置已应用');
    } catch (error) {
      toast.error('应用助手自动化设置失败');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const onRunNow = async () => {
    setRunningNow(true);
    try {
      await assistantRuntimeClient.runDailyAutomationNow();
      await refreshStatus();
      toast.success('每日自动化任务已加入队列');
    } catch (error) {
      toast.error('加入每日自动化任务队列失败');
      console.error(error);
    } finally {
      setRunningNow(false);
    }
  };

  const activeStatusLabel = status?.activeRun
    ? `${status.activeRun.status} · 第 ${status.activeRun.attemptCount}/${status.config.maxAttempts} 次尝试`
    : draftEnabled
      ? '已启用'
      : '已停用';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-4 text-sm font-medium">助手每日自动化</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>启用</Label>
              <p className="text-xs text-muted-foreground">
                启用后，应用会在本地后台按日启动一轮 Codex 排期 proposal。
              </p>
            </div>
            <Toggle
              checked={draftEnabled}
              disabled={loading || saving || runningNow}
              onToggle={() => {
                setDraftEnabled(!draftEnabled);
                setDirty(true);
              }}
            />
          </div>

          <div className="space-y-2">
              <Label htmlFor="assistant-automation-time">本地运行时间</Label>
            <Input
              id="assistant-automation-time"
              type="time"
              value={draftLocalTime}
              onChange={(event) => {
                setDraftLocalTime(event.target.value);
                setDirty(true);
              }}
              disabled={loading || saving || runningNow}
            />
          </div>

          <div className="space-y-2">
              <Label htmlFor="assistant-automation-config-path">Codex 配置文件</Label>
            <Input
              id="assistant-automation-config-path"
              value={draftConfigFilePath}
              onChange={(event) => {
                setDraftConfigFilePath(event.target.value);
                setDirty(true);
              }}
              disabled={loading || saving || runningNow}
              placeholder="留空时使用默认 Codex 配置"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="assistant-automation-profile">Codex Profile</Label>
            <Input
              id="assistant-automation-profile"
              value={draftConfigProfile}
              onChange={(event) => {
                setDraftConfigProfile(event.target.value);
                setDirty(true);
              }}
              disabled={loading || saving || runningNow}
              placeholder="可选 profile 名称"
            />
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Worker 状态</span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs',
                  status?.activeRun?.status === 'running' && 'bg-amber-500/15 text-amber-700',
                  status?.activeRun?.status === 'queued' && 'bg-sky-500/15 text-sky-700',
                  !status?.activeRun && draftEnabled && 'bg-emerald-500/15 text-emerald-700',
                  (!draftEnabled || status?.activeRun?.status === 'failed') && 'bg-slate-500/15 text-slate-700',
                )}
              >
                {loading ? '加载中…' : activeStatusLabel}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              重试策略：{status?.config.retryDelayMinutes ?? 15} 分钟 · 最多 {status?.config.maxAttempts ?? 3} 次
            </p>
            {status?.activeRun && (
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>运行 ID：{status.activeRun.runId}</p>
                <p>计划时间：{formatDateTime(status.activeRun.scheduledFor)}</p>
                <p>开始时间：{formatDateTime(status.activeRun.startedAt)}</p>
                {status.activeRun.nextRetryAt && (
                  <p>下次重试：{formatDateTime(status.activeRun.nextRetryAt)}</p>
                )}
                {status.activeRun.error && (
                  <p className="text-rose-600">{status.activeRun.error}</p>
                )}
              </div>
            )}
            {!status?.activeRun && status?.lastCompletedRun?.summary && (
              <p className="text-xs text-muted-foreground">
                最近提案：{status.lastCompletedRun.summary}
              </p>
            )}
            {dirty && <p className="text-xs text-amber-600">当前有尚未应用的变更。</p>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={onApply}
              disabled={loading || saving || runningNow || !dirty}
            >
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {!saving && <RotateCw className="mr-1.5 h-4 w-4" />}
              应用
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refreshStatus()}
              disabled={loading || saving || runningNow}
            >
              <RotateCw className="mr-1.5 h-4 w-4" />
              刷新
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onRunNow}
              disabled={loading || saving || runningNow}
            >
              {runningNow ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <RotateCw className="mr-1.5 h-4 w-4" />
              )}
              立即运行
            </Button>
          </div>

          <div className="space-y-2">
              <h4 className="text-sm font-medium">最近运行</h4>
            {!status?.recentRuns.length && (
              <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                当前还没有 daily automation run 记录。
              </div>
            )}
            {status?.recentRuns.map((run) => (
              <div key={run.runId} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium">
                    {run.triggerKind === 'manual' ? '手动运行' : `计划运行 ${run.runDate ?? ''}`}
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs',
                      run.status === 'completed' && 'bg-emerald-500/15 text-emerald-700',
                      run.status === 'running' && 'bg-amber-500/15 text-amber-700',
                      run.status === 'queued' && 'bg-sky-500/15 text-sky-700',
                      run.status === 'failed' && 'bg-rose-500/15 text-rose-700',
                    )}
                  >
                    {run.status}
                  </span>
                </div>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <p>更新时间：{formatDateTime(run.updatedAt)}</p>
                  <p>尝试次数：{run.attemptCount}</p>
                  {run.summary && <p className="text-foreground/80">{run.summary}</p>}
                  {run.error && <p className="text-rose-600">{run.error}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
