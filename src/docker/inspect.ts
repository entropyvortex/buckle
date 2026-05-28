import { execa } from 'execa';

type ExecaResult = { stdout: string; stderr: string; exitCode: number };

import { BuckleError, ErrorCode } from '../util/errors.js';
import { LABEL_LOCAL_FOLDER } from './naming.js';

export type Status = 'absent' | 'built' | 'running' | 'dead' | 'broken';

export interface ContainerInfo {
  id: string;
  name: string;
  state: string;
  status: Status;
  image: string;
  labels: Record<string, string>;
  ports: { host?: number; container: number; protocol: string }[];
}

export interface DockerProbeOptions {
  /** When true, runs commands but never raises on non-zero — used for `doctor`. */
  soft?: boolean;
  /** Override docker binary (default `docker`). */
  bin?: string;
}

export class DockerCli {
  constructor(private readonly opts: DockerProbeOptions = {}) {}

  private bin(): string {
    return this.opts.bin ?? 'docker';
  }

  /** Returns true if the docker daemon is reachable. */
  async ping(): Promise<boolean> {
    try {
      await execa(this.bin(), ['version', '--format', '{{.Server.Version}}'], {
        stdio: 'pipe',
        timeout: 5000,
      });
      return true;
    } catch {
      return false;
    }
  }

  async assertUp(): Promise<void> {
    if (!(await this.ping())) {
      throw new BuckleError(
        ErrorCode.E_DOCKER_DOWN,
        'Docker daemon is not accessible.',
        'Start Docker Desktop, OrbStack, Colima, or run `sudo systemctl start docker`.',
      );
    }
  }

  /** Find every container labeled with the given workspace folder. */
  async findByWorkspace(absWorkspace: string): Promise<ContainerInfo[]> {
    const ids = await this.psIds(['-a', '--filter', `label=${LABEL_LOCAL_FOLDER}=${absWorkspace}`]);
    if (ids.length === 0) return [];
    return this.inspect(ids);
  }

  async findByName(name: string): Promise<ContainerInfo | undefined> {
    const all = await this.psIds(['-a', '--filter', `name=^${name}$`]);
    if (all.length === 0) return undefined;
    const info = await this.inspect(all);
    return info[0];
  }

  /** Translate raw `docker inspect` output into our ContainerInfo. */
  private async inspect(ids: string[]): Promise<ContainerInfo[]> {
    const r = await this.run(['inspect', ...ids]);
    if (!r) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(r.stdout);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    const out: ContainerInfo[] = [];
    for (const c of parsed as Record<string, unknown>[]) {
      const id = (c['Id'] as string | undefined) ?? '';
      const name = ((c['Name'] as string | undefined) ?? '').replace(/^\//, '');
      const state = (c['State'] as Record<string, unknown> | undefined)?.['Status'] as string | undefined;
      const exitCode = (c['State'] as Record<string, unknown> | undefined)?.['ExitCode'] as number | undefined;
      const config = (c['Config'] as Record<string, unknown> | undefined) ?? {};
      const labels = (config['Labels'] as Record<string, string> | undefined) ?? {};
      const image = (config['Image'] as string | undefined) ?? '';

      let status: Status;
      switch (state) {
        case 'running':
          status = 'running';
          break;
        case 'exited':
          status = (exitCode ?? 0) === 0 ? 'built' : 'dead';
          break;
        case 'created':
          status = 'built';
          break;
        case 'paused':
        case 'restarting':
          status = 'running';
          break;
        case 'dead':
          status = 'dead';
          break;
        default:
          status = 'broken';
      }

      const networkSettings = (c['NetworkSettings'] as Record<string, unknown> | undefined) ?? {};
      const portsRaw = (networkSettings['Ports'] as Record<string, unknown> | undefined) ?? {};
      const ports: ContainerInfo['ports'] = [];
      for (const [k, bindings] of Object.entries(portsRaw)) {
        const m = /^(\d+)\/(tcp|udp)$/.exec(k);
        if (!m) continue;
        const containerPort = Number(m[1]);
        const protocol = m[2]!;
        if (Array.isArray(bindings)) {
          for (const b of bindings as Record<string, string>[]) {
            ports.push({ host: Number(b['HostPort']), container: containerPort, protocol });
          }
        } else {
          ports.push({ container: containerPort, protocol });
        }
      }

      out.push({ id, name, state: state ?? 'unknown', status, image, labels, ports });
    }
    return out;
  }

  private async psIds(args: string[]): Promise<string[]> {
    const r = await this.run(['ps', '-q', ...args]);
    if (!r) return [];
    return r.stdout
      .split('\n')
      .map((s: string) => s.trim())
      .filter(Boolean);
  }

  private async run(args: string[]): Promise<ExecaResult | undefined> {
    try {
      const r = await execa(this.bin(), args, { stdio: 'pipe', timeout: 30_000 });
      return { stdout: String(r.stdout ?? ''), stderr: String(r.stderr ?? ''), exitCode: r.exitCode ?? 0 };
    } catch (e) {
      if (this.opts.soft) return undefined;
      throw new BuckleError(
        ErrorCode.E_DOCKER_DOWN,
        `docker ${args.join(' ')} failed: ${(e as Error).message}`,
      );
    }
  }
}
