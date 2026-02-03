import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Command, type Child } from '@tauri-apps/plugin-shell';

type TunnelStatus = 'starting' | 'running' | 'stopping' | 'error' | 'stopped';

interface TunnelInstance {
  port: number;
  status: TunnelStatus;
  url: string | null;
  logs: string[];
  child: Child | null;
  chunkBuffer: string;
}

function extractUrl(line: string): string | null {
  const match = line.match(/https?:\/\/\S+/);
  return match?.[0] ?? null;
}

function sanitizeTerminalOutput(input: string): string {
  const text = input
    .replace(/\r/g, '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*(\u0007|\u001b\\)/g, '');

  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

export default function App() {
  const [inputPort, setInputPort] = useState<number>(3000);
  const [tunnels, setTunnels] = useState<Record<number, TunnelInstance>>({});
  const [activeTab, setActiveTab] = useState<number | null>(null);

  const activeInstance = activeTab !== null ? tunnels[activeTab] : null;

  const updateInstance = (port: number, patch: Partial<TunnelInstance> | ((prev: TunnelInstance) => TunnelInstance)) => {
    setTunnels(prev => {
      const current = prev[port];
      if (!current && typeof patch === 'function') return prev;
      
      const updated = typeof patch === 'function' 
        ? patch(current) 
        : { ...current, ...patch };

      return { ...prev, [port]: updated };
    });
  };

  const startTunnel = async (port: number) => {
    if (tunnels[port]?.status === 'running' || tunnels[port]?.status === 'starting') return;

    const newInstance: TunnelInstance = {
      port,
      status: 'starting',
      url: null,
      logs: [],
      child: null,
      chunkBuffer: '',
    };

    setTunnels(prev => ({ ...prev, [port]: newInstance }));
    setActiveTab(port);

    try {
      const command = Command.create('onlocal', [String(port)]);

      command.on('close', (data: { code: number | null; signal: number | null }) => {
        updateInstance(port, (prev) => ({
          ...prev,
          status: 'stopped',
          child: null,
          logs: [...prev.logs, `process exited (code=${data.code}, signal=${data.signal})`].slice(-800)
        }));
      });

      command.on('error', (err: string) => {
        updateInstance(port, (prev) => ({
          ...prev,
          status: 'error',
          child: null,
          logs: [...prev.logs, `process error: ${String(err)}`].slice(-800)
        }));
      });

      command.stdout.on('data', (chunk: unknown) => {
        const text = sanitizeTerminalOutput(String(chunk));
        if (!text) return;

        updateInstance(port, (prev) => {
          const combined = prev.chunkBuffer + text;
          const parts = combined.split(/\n/);
          const newBuffer = parts.pop() ?? '';
          
          let newUrl = prev.url;
          const newLogs = [...prev.logs];
          
          for (const p of parts) {
            const cleaned = p.trim();
            if (!cleaned) continue;
            newLogs.push(cleaned);
            if (!newUrl) {
              const extracted = extractUrl(cleaned);
              if (extracted) newUrl = extracted;
            }
          }

          return {
            ...prev,
            logs: newLogs.slice(-800),
            url: newUrl,
            chunkBuffer: newBuffer
          };
        });
      });

      const child = await command.spawn();
      updateInstance(port, { child, status: 'running' });
    } catch (e) {
      updateInstance(port, { 
        status: 'error', 
        logs: [`failed to start: ${String(e)}`] 
      });
    }
  };

  const stopTunnel = async (port: number) => {
    const inst = tunnels[port];
    if (!inst || inst.status !== 'running') return;

    updateInstance(port, { status: 'stopping' });

    try {
      if (inst.child) {
        await inst.child.kill();
      }
      updateInstance(port, { status: 'stopped', child: null });
    } catch (e) {
      updateInstance(port, (prev) => ({
        ...prev,
        status: 'error',
        logs: [...prev.logs, `failed to stop: ${String(e)}`].slice(-800)
      }));
    }
  };

  const copyUrl = async (url: string | null) => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
  };

  const openUrl = (url: string | null) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const tunnelList = Object.values(tunnels).sort((a, b) => b.port - a.port);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="card">
          <div className="title">OnLocal</div>
          <div className="sidebarTop">
            <input
              className="input"
              aria-label="port"
              type="number"
              min={1}
              max={65535}
              value={inputPort}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setInputPort(Number(e.target.value))}
            />
            <button className="button" onClick={() => startTunnel(inputPort)}>
              Open
            </button>
          </div>
        </div>

        <div className="card scrollable">
          <div className="sectionTitle">Tunnels</div>
          <div className="recentList">
            {tunnelList.length === 0 ? (
              <div className="muted">No active tunnels.</div>
            ) : (
              tunnelList.map((t) => (
                <div 
                  key={t.port} 
                  className={`recentItem ${activeTab === t.port ? 'active' : ''}`}
                  onClick={() => setActiveTab(t.port)}
                >
                  <div className="recentHeader">
                    <div className="recentPort">:{t.port}</div>
                    <div className={`statusDot ${t.status}`} title={t.status} />
                  </div>
                  <div className="recentUrl">{t.url || 'Initializing...'}</div>
                  <div className="itemActions">
                    {t.url && (
                      <button className="miniButton" onClick={(e) => { e.stopPropagation(); copyUrl(t.url); }}>Copy</button>
                    )}
                    {t.status === 'running' ? (
                      <button className="miniButton danger" onClick={(e) => { e.stopPropagation(); stopTunnel(t.port); }}>Stop</button>
                    ) : (
                      <button className="miniButton" onClick={(e) => { e.stopPropagation(); startTunnel(t.port); }}>Start</button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="logsHeader">
          <div className="sectionTitle">
            {activeInstance ? `Logs for :${activeInstance.port}` : 'Select a tunnel'}
          </div>
          {activeInstance && (
            <button className="button secondary" onClick={() => updateInstance(activeInstance.port, { logs: [] })}>
              Clear
            </button>
          )}
        </div>
        <div className="logs">
          {!activeInstance ? (
            <div className="muted">Select a tunnel from the sidebar to view logs.</div>
          ) : activeInstance.logs.length === 0 ? (
            <div className="muted">Waiting for logs...</div>
          ) : (
            activeInstance.logs.map((line: string, idx: number) => (
              <div className="logLine" key={idx}>
                {line}
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}

