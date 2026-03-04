import { useEffect, useState } from 'react';
import { Loader2, RotateCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings-store';
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

type SettingsTab = 'mcp';

const NAV_ITEMS: { id: SettingsTab; label: string }[] = [
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

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('mcp');

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
            <button
              onClick={() => {
                setDraftEnabled(!draftEnabled);
                setDirty(true);
              }}
              disabled={loading || saving || restarting}
              className={cn(
                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                draftEnabled ? 'bg-primary' : 'bg-muted',
              )}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                  draftEnabled ? 'translate-x-4' : 'translate-x-0.5',
                )}
              />
            </button>
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
