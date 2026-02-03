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
  const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});

  const toggleLogs = (port: number) => {
    setExpandedLogs(prev => ({ ...prev, [port]: !prev[port] }));
  };

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
    setExpandedLogs(prev => ({ ...prev, [port]: true }));

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
      <header className="header">
        <div className="logo">ONLOCAL</div>
        <div className="portInput">
          <input
            className="input"
            aria-label="port"
            type="number"
            min={1}
            max={65535}
            value={inputPort}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setInputPort(Number(e.target.value))}
          />
          <button className="button primary" onClick={() => startTunnel(inputPort)}>
            Connect
          </button>
        </div>
      </header>

      <main className="mainContent">
        <div className="sectionHeader">
          <span className="sectionTitle">Recent Tunnels</span>
        </div>
        
        <div className="tunnelList">
          {tunnelList.length === 0 ? (
            <div className="emptyState">
              <div className="muted">No active tunnels</div>
            </div>
          ) : (
            tunnelList.map((t) => (
              <div key={t.port} className="tunnelCard">
                <div className="tunnelHeader" onClick={() => toggleLogs(t.port)}>
                  <div className="tunnelInfo">
                    <div className={`statusDot ${t.status}`} />
                    <div className="tunnelText">
                      <span className="portLabel">:{t.port}</span>
                      {t.url && (
                        <span className="urlText">{t.url.replace('https://', '')}</span>
                      )}
                    </div>
                  </div>
                  <div className="tunnelActions" onClick={(e) => e.stopPropagation()}>
                    {t.url && (
                      <button className="iconButton" title="Open URL" onClick={() => openUrl(t.url)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
                      </button>
                    )}
                    {t.url && (
                      <button className="iconButton" title="Copy URL" onClick={() => copyUrl(t.url)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      </button>
                    )}
                    {t.status === 'running' ? (
                      <button className="iconButton danger" title="Stop" onClick={() => stopTunnel(t.port)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                      </button>
                    ) : (
                      <button className="iconButton" title="Start" onClick={() => startTunnel(t.port)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 3l14 9-14 9V3z"/></svg>
                      </button>
                    )}
                  </div>
                </div>

                {expandedLogs[t.port] && (
                  <div className="tunnelLogsContainer">
                    <div className="logsHeaderSmall">
                      <span className="tinyTitle">Console</span>
                      <button className="textButton" onClick={() => updateInstance(t.port, { logs: [] })}>Clear</button>
                    </div>
                    <div className="logs">
                      {t.logs.length === 0 ? (
                        <div className="muted">Waiting for activity...</div>
                      ) : (
                        t.logs.map((line, idx) => (
                          <div className="logLine" key={idx}>{line}</div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}

